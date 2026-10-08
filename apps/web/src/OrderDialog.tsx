import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Check, Package, X } from 'lucide-react';
import { errorMessage, getOrder, isStatus, updateOrder } from './api';
import { dateLabel, initials, money } from './format';
import { STATUSES, STATUS_LABELS, type Order, type Status } from './models';
import { StatusBadge } from './OrdersTable';
import { useResource } from './useResource';

interface OrderDialogProps {
  id: string;
  onClose: () => void;
  onUpdated: (order: Order) => void;
}

export function OrderDialog({ id, onClose, onUpdated }: OrderDialogProps): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const saveController = useRef<AbortController | null>(null);
  const fetchOrder = useCallback((signal: AbortSignal) => getOrder(id, signal), [id]);
  const resource = useResource(fetchOrder);
  const [updated, setUpdated] = useState<Order | null>(null);
  const [nextStatus, setNextStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const order = updated ?? resource.data;
  const selectedStatus = nextStatus ?? order?.status ?? 'pending';

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { saveController.current?.abort(); };
  }, []);

  function dismiss(): void {
    if (saving) return;
    dialog.current?.close();
    onClose();
  }

  async function save(): Promise<void> {
    if (!order || saving || selectedStatus === order.status) return;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await updateOrder(order.id, selectedStatus, controller.signal);
      if (controller.signal.aborted) return;
      setUpdated(result);
      setNextStatus(null);
      setSaved(true);
      onUpdated(result);
    } catch (error) {
      if (!controller.signal.aborted) setSaveError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} className="order-dialog" aria-labelledby="detail-heading" aria-describedby="detail-description" onCancel={(event) => { event.preventDefault(); dismiss(); }} onClose={onClose}>
      <div className="dialog-heading"><div><span className="eyebrow">ORDER DETAILS</span><h2 id="detail-heading">{id}</h2></div><button className="icon-button" onClick={dismiss} disabled={saving} aria-label="Close order details" autoFocus><X size={20} /></button></div>
      <p id="detail-description" className="dialog-description">Review this order and manage its fulfillment status.</p>
      {resource.loading ? <div className="table-state" role="status">Loading order details...</div> : resource.error ? <div className="table-state" role="alert"><p>{resource.error}</p><button className="button" onClick={resource.refresh}>Retry details</button></div> : order ? (
        <>
          <div className="detail-customer"><span className="avatar">{initials(order.customer.name)}</span><div><strong>{order.customer.name}</strong><span>{order.customer.email}</span></div><StatusBadge status={order.status} /></div>
          <div className="detail-date">Placed {dateLabel(order.createdAt)} (UTC)</div>
          <h3 className="detail-section-title"><Package size={16} aria-hidden="true" />Order items</h3>
          <div className="detail-items"><table><caption className="sr-only">Line items for order {id}</caption><thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col" className="align-right">Total</th></tr></thead><tbody>{order.items.map((item, index) => <tr key={`${item.name}-${index}`}><td><strong>{item.name}</strong><span>{money(item.unitPriceCents)} each</span></td><td>{item.quantity}</td><td className="align-right">{money(item.quantity * item.unitPriceCents)}</td></tr>)}</tbody></table></div>
          <div className="detail-total"><span>Order total</span><strong>{money(order.totalCents)} <small>USD</small></strong></div>
          <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <label className="status-edit" htmlFor="order-status">Order status<select id="order-status" value={selectedStatus} disabled={saving} onChange={(event) => { if (isStatus(event.target.value)) setNextStatus(event.target.value); setSaved(false); setSaveError(null); }}>{STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
            {saveError ? <p className="save-error" role="alert">{saveError}</p> : null}
            <div className="dialog-actions"><span className="save-status" role="status">{saving ? 'Saving status...' : saved ? <><Check size={15} aria-hidden="true" />Status updated</> : 'Changes are saved to the demo API.'}</span><button type="submit" className="button primary" disabled={saving || selectedStatus === order.status}>{saving ? 'Saving...' : 'Save changes'}</button></div>
          </form>
        </>
      ) : null}
    </dialog>
  );
}
