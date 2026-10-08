import type { ReactElement } from 'react';
import { ArrowRight, Search, SlidersHorizontal } from 'lucide-react';
import { dateLabel, initials, money } from './format';
import { STATUSES, STATUS_LABELS, type Order, type Status } from './models';

interface OrdersTableProps {
  orders: Order[] | null;
  search: string;
  status: string;
  loading: boolean;
  error: string | null;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onRetry: () => void;
  onOpen: (id: string) => void;
}

export function StatusBadge({ status }: { status: Status }): ReactElement {
  return <span className={`status-badge ${status}`}><i aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}

export function OrdersTable({ orders, search, status, loading, error, onSearch, onStatus, onRetry, onOpen }: OrdersTableProps): ReactElement {
  const visibleOrders = error ? [] : orders ?? [];
  return (
    <section className="panel orders-panel" id="orders" aria-labelledby="orders-heading" aria-busy={loading}>
      <div className="panel-heading orders-heading"><div><div className="heading-with-count"><h2 id="orders-heading">Orders</h2><span className="count-tag">{loading ? '...' : visibleOrders.length}</span></div><p>Your order book, from first click to doorstep.</p></div><span className="subtle-tag">All dates in UTC</span></div>
      <div className="table-toolbar">
        <label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Search by customer name or order ID</span><input type="search" placeholder="Search customer or order ID..." value={search} onChange={(event) => onSearch(event.target.value)} /></label>
        <label className="filter-field"><SlidersHorizontal size={15} aria-hidden="true" /><span className="sr-only">Filter orders by status</span><select value={status} onChange={(event) => onStatus(event.target.value)}><option value="">All statuses</option>{STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></label>
      </div>
      {error ? <div className="table-state" role="alert"><strong>We couldn't load your orders</strong><p>{error}</p><button className="button" onClick={onRetry} disabled={loading}>Retry orders</button></div> : loading ? <div className="table-state loading-state" role="status"><span className="loading-ring" aria-hidden="true" />Loading orders...</div> : visibleOrders.length === 0 ? <div className="table-state" role="status"><Search size={26} aria-hidden="true" /><strong>No orders found</strong><p>{search || status ? 'Try another search or clear your filters.' : 'Your order book is empty.'}</p>{search || status ? <button className="button" onClick={() => { onSearch(''); onStatus(''); }}>Clear filters</button> : null}</div> : (
        <div className="table-scroll"><table><caption className="sr-only">Orders matching the current search and status filter. Open an order to view items and update its status.</caption><thead><tr><th scope="col">Order ID</th><th scope="col">Customer</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" className="align-right">Amount</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead><tbody>{visibleOrders.map((order) => (
          <tr key={order.id}><td><button className="order-link" onClick={() => onOpen(order.id)} aria-label={`View order ${order.id}`}>{order.id}</button></td><td><div className="customer-cell"><span className="avatar" aria-hidden="true">{initials(order.customer.name)}</span><div><span className="customer-name">{order.customer.name}</span><span className="customer-email">{order.customer.email}</span></div></div></td><td className="date-cell">{dateLabel(order.createdAt)}</td><td><StatusBadge status={order.status} /></td><td className="amount-cell align-right">{money(order.totalCents)}</td><td><button className="icon-button row-open" onClick={() => onOpen(order.id)} aria-label={`Open details for ${order.id}`}><ArrowRight size={17} /></button></td></tr>
        ))}</tbody></table></div>
      )}
      <div className="table-footer" role="status">{loading ? 'Updating order list...' : error ? 'Order list unavailable' : `Showing ${visibleOrders.length} ${visibleOrders.length === 1 ? 'order' : 'orders'}${search || status ? ' matching your filters' : ''}`}<span>Amounts in USD</span></div>
    </section>
  );
}
