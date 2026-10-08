import type { ReactElement } from 'react';
import { ArrowUpRight, CircleDollarSign, Clock3, Package, ShoppingBag } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, shortDate } from './format';
import { STATUSES, STATUS_COLORS, STATUS_LABELS, type Summary } from './models';

interface AnalyticsProps {
  summary: Summary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function Analytics({ summary, loading, error, onRetry }: AnalyticsProps): ReactElement {
  const data = error ? null : summary;
  const metrics = [
    { label: 'Total orders', value: data?.totalOrders.toLocaleString('en-US'), note: 'Across all order statuses', icon: ShoppingBag },
    { label: 'Total revenue', value: data ? money(data.totalRevenueCents) : undefined, note: 'Processing, shipped & delivered', icon: CircleDollarSign },
    { label: 'Average order value', value: data ? money(data.averageOrderValueCents) : undefined, note: 'Revenue-eligible orders', icon: ArrowUpRight },
    { label: 'Pending orders', value: data?.ordersByStatus.pending.toLocaleString('en-US'), note: 'Awaiting the next step', icon: Clock3 },
  ];

  return (
    <section aria-label="Order analytics" aria-busy={loading}>
      <div className="metric-grid">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <article className="metric-card" key={label}>
            <div className="metric-top"><span>{label}</span><Icon size={18} aria-hidden="true" /></div>
            <div className={`metric-value${!value && loading ? ' skeleton' : ''}`}>{value ?? (loading ? '\u00a0' : 'Unavailable')}</div>
            <p>{note}</p>
          </article>
        ))}
      </div>
      {error ? (
        <div className="error-banner" role="alert"><span><strong>Analytics unavailable.</strong> {error} Your orders are still accessible below.</span><button className="button" onClick={onRetry} disabled={loading}>Retry analytics</button></div>
      ) : null}
      <div className="chart-grid">
        <article className="panel revenue-panel">
          <div className="panel-heading"><div><h2>Revenue overview</h2><p>Daily order revenue, in USD</p></div><span className="subtle-tag">{data ? `${data.revenueByDay.length} days` : 'Demo period'}</span></div>
          {data ? <RevenueChart summary={data} /> : <ChartPlaceholder loading={loading} />}
        </article>
        <article className="panel status-panel">
          <div className="panel-heading"><div><h2>Order distribution</h2><p>Every order, at a glance</p></div><Package size={19} aria-hidden="true" /></div>
          {data ? <StatusChart summary={data} /> : <ChartPlaceholder loading={loading} />}
        </article>
      </div>
    </section>
  );
}

function ChartPlaceholder({ loading }: { loading: boolean }) {
  return <div className={`chart-placeholder${loading ? ' skeleton' : ''}`} role="status">{loading ? 'Loading analytics...' : 'Analytics are currently unavailable.'}</div>;
}

function RevenueChart({ summary }: { summary: Summary }) {
  const first = summary.revenueByDay[0]?.date;
  const last = summary.revenueByDay.at(-1)?.date;
  return (
    <>
      <div className="chart-value"><strong>{money(summary.totalRevenueCents)}</strong><span>{first && last ? `${shortDate(first)} - ${shortDate(last)} (UTC)` : 'No revenue recorded'}</span></div>
      <div className="area-chart" aria-label="Daily revenue chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={summary.revenueByDay} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
            <defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#628b75" stopOpacity={0.24} /><stop offset="100%" stopColor="#628b75" stopOpacity={0.01} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#eeede8" strokeDasharray="4 4" />
            <XAxis dataKey="date" tickFormatter={shortDate} axisLine={false} tickLine={false} tick={{ fill: '#81857e', fontSize: 11 }} minTickGap={26} dy={8} />
            <YAxis tickFormatter={(value: number) => `$${value / 100}`} axisLine={false} tickLine={false} tick={{ fill: '#81857e', fontSize: 11 }} width={52} />
            <Tooltip formatter={(value) => [money(Number(value ?? 0)), 'Revenue']} labelFormatter={(label) => `${shortDate(String(label))} (UTC)`} contentStyle={{ borderRadius: 10, border: '1px solid #e5e7df', fontSize: 12 }} />
            <Area type="monotone" dataKey="revenueCents" stroke="#416a54" strokeWidth={2.5} fill="url(#revenue-fill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data"><summary>View daily revenue data</summary><ul>{summary.revenueByDay.map((day) => <li key={day.date}><span>{shortDate(day.date)} (UTC)</span><strong>{money(day.revenueCents)}</strong></li>)}</ul></details>
    </>
  );
}

function StatusChart({ summary }: { summary: Summary }) {
  const distribution = STATUSES.map((status) => ({ name: STATUS_LABELS[status], value: summary.ordersByStatus[status], color: STATUS_COLORS[status] }));
  return (
    <div className="distribution-content">
      <div className="donut-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart><Pie data={distribution} dataKey="value" innerRadius={60} outerRadius={78} paddingAngle={3} stroke="none" isAnimationActive={false}>{distribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie></PieChart>
        </ResponsiveContainer>
        <div className="donut-total"><strong>{summary.totalOrders}</strong><span>Total orders</span></div>
      </div>
      <ul className="status-legend" aria-label="Orders by status">{distribution.map((item) => <li key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{item.value}</strong></li>)}</ul>
    </div>
  );
}
