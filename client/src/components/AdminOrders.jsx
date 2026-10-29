import { useEffect, useState } from "react";
import { api } from "../services/api";
const statuses = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];
export default function AdminOrders() {
  const [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  async function load() {
    try {
      const r = await api.get("/admin/dashboard");
      setOrders(r.data.recentOrders || r.data.orders || []);
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load orders");
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(order, form) {
    setBusy(order._id);
    setError("");
    try {
      await api.patch(`/orders/${order._id}/status`, form);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not update order");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="admin-orders">
      <div className="admin-list-head">
        <div>
          <h2>Order fulfilment</h2>
          <p>Update order status and shipment tracking details.</p>
        </div>
        <button className="btn btn-outline" onClick={load}>
          Refresh orders
        </button>
      </div>
      {error && <p className="notice error">{error}</p>}
      {orders.map((o) => (
        <OrderRow key={o._id} order={o} busy={busy === o._id} save={save} />
      ))}
    </div>
  );
}
function OrderRow({ order, busy, save }) {
  const [status, setStatus] = useState(order.status),
    [courier, setCourier] = useState(order.tracking?.courier || ""),
    [trackingNumber, setTrackingNumber] = useState(
      order.tracking?.trackingNumber || "",
    ),
    [trackingUrl, setTrackingUrl] = useState(order.tracking?.trackingUrl || ""),
    [note, setNote] = useState("");
  return (
    <form
      className="admin-order-row"
      onSubmit={(e) => {
        e.preventDefault();
        save(order, { status, courier, trackingNumber, trackingUrl, note });
      }}
    >
      <div className="admin-order-overview">
        <b>
          #{String(order._id).slice(-8).toUpperCase()} ·{" "}
          {order.user?.name || "Customer"}
        </b>
        <span>
          ₹{order.total} · {order.paymentMethod} ({order.paymentStatus})
        </span>
        <small>
          {order.shippingAddress?.city}, {order.shippingAddress?.state} ·{" "}
          {new Date(order.createdAt).toLocaleDateString()}
        </small>
      </div>
      <div className="admin-order-fields">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Courier
          <input
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            placeholder="Courier partner"
          />
        </label>
        <label>
          Tracking number
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Tracking ID"
          />
        </label>
        <label>
          Tracking URL (HTTPS)
          <input
            type="url"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label>
          Customer note
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional status note"
          />
        </label>
        <button className="btn btn-dark" disabled={busy}>
          {busy ? "Saving…" : "Save order"}
        </button>
      </div>
    </form>
  );
}
