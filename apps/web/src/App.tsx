import { useCallback, useState, type ReactElement } from 'react';
import { ArrowUpRight, Boxes, ChevronRight, LayoutDashboard, Package, RefreshCw, ShoppingBag } from 'lucide-react';
import { Analytics } from './Analytics';
import { getOrders, getSummary } from './api';
import { OrderDialog } from './OrderDialog';
import { OrdersTable } from './OrdersTable';
import { useResource } from './useResource';

export function App(): ReactElement {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState('overview');
  const fetchOrders = useCallback((signal: AbortSignal) => getOrders(search, status, signal), [search, status]);
  const orders = useResource(fetchOrders);
  const analytics = useResource(getSummary);
  const refreshing = orders.loading || analytics.loading;

  function refresh(): void {
    orders.refresh();
    analytics.refresh();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#overview" onClick={() => setSection('overview')}><span className="brand-icon"><Boxes size={24} strokeWidth={1.6} aria-hidden="true" /></span><span>Order<span className="brand-light">Pulse</span><small>OPERATIONS, IN SYNC</small></span></a>
        <span className="nav-caption">WORKSPACE</span>
        <nav><a href="#overview" className={section === 'overview' ? 'active' : ''} aria-current={section === 'overview' ? 'location' : undefined} onClick={() => setSection('overview')}><LayoutDashboard size={18} aria-hidden="true" />Overview<ChevronRight size={14} className="nav-arrow" aria-hidden="true" /></a><a href="#orders" className={section === 'orders' ? 'active' : ''} aria-current={section === 'orders' ? 'location' : undefined} onClick={() => setSection('orders')}><ShoppingBag size={18} aria-hidden="true" />Orders<ChevronRight size={14} className="nav-arrow" aria-hidden="true" /></a></nav>
        <div className="sidebar-note"><span className="note-icon"><Package size={21} aria-hidden="true" /></span><h2>A little order.<br />A lot of clarity.</h2><p>One place to keep your orders moving forward.</p><a href="#orders" onClick={() => setSection('orders')}>Explore your orders<ArrowUpRight size={15} aria-hidden="true" /></a></div>
        <div className="workspace-profile"><span className="workspace-avatar">OP</span><div><strong>OrderPulse Demo</strong><small>Sample workspace</small></div></div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={13} aria-hidden="true" /><span>{section === 'orders' ? 'Orders' : 'Overview'}</span></div><div className="topbar-end"><span className="demo-label">DEMO WORKSPACE</span><span className="topbar-avatar" aria-label="OrderPulse workspace">OP</span></div></header>
        <main id="main-content">
          <section className="page-heading" id="overview"><div><span className="eyebrow">YOUR BUSINESS, AT A GLANCE</span><h1>Operations overview<span>.</span></h1><p>A clear view of your orders and the numbers behind them.</p></div><button className="button refresh-button" onClick={refresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spinning' : ''} aria-hidden="true" />{refreshing ? 'Refreshing...' : 'Refresh data'}</button></section>
          <Analytics summary={analytics.data} loading={analytics.loading} error={analytics.error} onRetry={analytics.refresh} />
          <OrdersTable orders={orders.data} search={search} status={status} loading={orders.loading} error={orders.error} onSearch={setSearch} onStatus={setStatus} onRetry={orders.refresh} onOpen={setSelectedId} />
          <footer className="page-footer"><span>OrderPulse <span aria-hidden="true">/</span> A calmer way to manage orders.</span><span>Sample data. Real workflow.</span></footer>
        </main>
      </div>
      {selectedId ? <OrderDialog key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} onUpdated={refresh} /> : null}
    </div>
  );
}
