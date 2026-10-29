import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
const stages = ["pending", "paid", "processing", "shipped", "delivered"];
export default function Orders() {
  const { user, ready } = useAuth();
  const [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [params] = useSearchParams();
  async function load() {
    const r = await api.get("/orders/mine");
    setOrders(r.data.orders);
  }
  useEffect(() => {
    if (user)
      load().catch((e) =>
        setError(e.response?.data?.message || "Could not load orders"),
      );
  }, [user]);
  useEffect(() => {
    if (user && params.get("payment") === "return" && params.get("order_id"))
      api
        .post(`/orders/${params.get("order_id")}/verify-payment`)
        .then(() => {
          setNotice("Payment status refreshed.");
          load();
        })
        .catch((e) =>
          setError(
            e.response?.data?.message ||
              "Payment status is still being confirmed",
          ),
        );
  }, [user, params]);
  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  async function changeAddress(order) {
    const profile = (await api.get("/profile")).data.profile;
    const list = profile.addresses || [];
    if (!list.length) {
      setError("Add a saved address in My profile first.");
      return;
    }
    const choice = window.prompt(
      "Choose a saved address number:\n" +
        list
          .map((a, i) => `${i + 1}. ${a.label}: ${a.line1}, ${a.city}`)
          .join("\n"),
      String(Math.max(1, list.findIndex((a) => a.isDefault) + 1)),
    );
    const index = Number(choice) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= list.length) return;
    setBusy(order._id);
    try {
      await api.patch(`/orders/${order._id}/address`, {
        shippingAddress: list[index],
      });
      setNotice("Delivery address updated.");
      await load();
    } catch (e) {
      setError(
        e.response?.data?.message || "Address cannot be changed for this order",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="section orders-page">
      <span className="eyebrow">YOUR PURCHASES</span>
      <h1 className="account-title">
        My <em>orders.</em>
      </h1>
      <p className="account-intro">
        Track each order, review its delivery address and check payment status.
      </p>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="notice error">{error}</p>}
      {!orders.length ? (
        <div className="empty-products">
          <h3>No orders yet.</h3>
          <p>Your next favourite fragrance is waiting.</p>
          <Link className="btn btn-dark" to="/shop">
            Explore the shop
          </Link>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((o) => (
            <article className="order-card" key={o._id}>
              <div className="order-card-head">
                <div>
                  <span className="eyebrow">
                    ORDER #{String(o._id).slice(-8).toUpperCase()}
                  </span>
                  <p>Placed {new Date(o.createdAt).toLocaleString()}</p>
                </div>
                <span className={`status-pill status-${o.status}`}>
                  {o.status}
                </span>
              </div>
              <div className="order-products">
                {o.items.map((i, n) => (
                  <div key={`${i.product}-${n}`}>
                    <span>
                      {i.name} × {i.quantity}
                    </span>
                    <b>₹{i.price * i.quantity}</b>
                  </div>
                ))}
              </div>
              <div className="order-card-summary">
                <div>
                  <small>Order total</small>
                  <strong>₹{o.total}</strong>
                </div>
                <div>
                  <small>Payment</small>
                  <b>
                    {o.paymentMethod === "cashfree"
                      ? "Cashfree online"
                      : "Cash on Delivery"}{" "}
                    · {o.paymentStatus}
                  </b>
                </div>
                <div>
                  <small>Delivery address</small>
                  <p>
                    {o.shippingAddress?.fullName}, {o.shippingAddress?.line1},{" "}
                    {o.shippingAddress?.city}, {o.shippingAddress?.state}{" "}
                    {o.shippingAddress?.postalCode}
                  </p>
                </div>
              </div>
              {o.tracking?.trackingNumber && (
                <div className="tracking-info">
                  <b>Shipment tracking</b>
                  <p>
                    {o.tracking.courier || "Courier"} ·{" "}
                    {o.tracking.trackingNumber}
                  </p>
                  {o.tracking.trackingUrl && (
                    <a
                      className="text-link"
                      href={o.tracking.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Track shipment
                    </a>
                  )}
                </div>
              )}
              <div className="timeline">
                {(o.statusHistory?.length
                  ? o.statusHistory
                  : [{ status: o.status, at: o.updatedAt }]
                ).map((h, i) => (
                  <div className="timeline-item" key={`${h.status}-${i}`}>
                    <i />
                    <div>
                      <b>{h.status}</b>
                      <p>{h.note || ""}</p>
                      <small>{new Date(h.at).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
              </div>
              {["pending", "paid", "processing"].includes(o.status) &&
                o.addressChangeAllowed && (
                  <button
                    className="btn btn-outline"
                    disabled={busy === o._id}
                    onClick={() => changeAddress(o)}
                  >
                    {busy === o._id ? "Updating…" : "Change delivery address"}
                  </button>
                )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
