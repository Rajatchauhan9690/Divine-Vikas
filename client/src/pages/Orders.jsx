import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Package,
} from "lucide-react";
import {
  Link,
  Navigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import { useCart } from "../features/cart/CartContext";
const stages = ["pending", "paid", "processing", "shipped", "delivered"];
const cancellationWindowMs = 6 * 60 * 60 * 1000;
function getOrderReturnWindowDays(order) {
  if (
    !order.items?.length ||
    order.items.some(
      (item) =>
        item.returnable === false ||
        !Number.isInteger(item.returnWindowDays) ||
        item.returnWindowDays < 1,
    )
  )
    return null;
  return Math.min(
    ...order.items.map((item) => item.returnWindowDays),
  );
}
const emptyAddress = {
  label: "Home",
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  landmark: "",
};
export default function Orders() {
  const { user, ready } = useAuth();
  const { items: cartItems, remove } = useCart();
  const [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [ordersLoaded, setOrdersLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [params] = useSearchParams();
  const { id: orderId } = useParams();
  const verifiedPaymentReturn = useRef("");
  const [addressChangeOrderId, setAddressChangeOrderId] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressMode, setAddressMode] = useState("saved");
  const [newAddress, setNewAddress] = useState(emptyAddress);
  const [returnReason, setReturnReason] = useState("");
  const [returnOrderId, setReturnOrderId] = useState("");
  async function load() {
    const r = await api.get("/orders/mine");
    setOrders(r.data.orders);
    setOrdersLoaded(true);
  }
  useEffect(() => {
    if (!user) return;
    load()
      .catch((e) =>
        setError(e.response?.data?.message || "Could not load orders"),
      )
      .finally(() => {
        setOrdersLoaded(true);
      });
  }, [user]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const attemptId = params.get("order_id");
    const verificationKey = `${user?.id || ""}:${attemptId || ""}`;
    if (
      user &&
      params.get("payment") === "return" &&
      attemptId &&
      verifiedPaymentReturn.current !== verificationKey
    ) {
      verifiedPaymentReturn.current = verificationKey;
      api
        .post(`/orders/${attemptId}/verify-payment`)
        .then(async ({ data }) => {
          if (data.paymentStatus === "paid" && data.order) {
            setNotice("Payment successful. Your order has been placed.");
            for (const item of data.order.items || [])
              if (cartItems.some((cartItem) => cartItem._id === item.product))
                remove(String(item.product));
          } else if (data.paymentStatus === "failed") {
            setNotice(
              "Payment failed. No order was placed and reserved stock was released.",
            );
          } else if (data.paymentStatus === "expired") {
            setNotice(
              "The payment window expired. No order was placed; please start checkout again.",
            );
          } else if (data.paymentStatus === "refund_required") {
            setError(
              "Payment succeeded after stock was released, but the items are no longer available. Please contact support to arrange a refund.",
            );
          } else {
            setNotice(
              "Payment is still being confirmed. No order will appear until Cashfree confirms it.",
            );
          }
          await load();
        })
        .catch((e) =>
          setError(
            e.response?.data?.message ||
              "Payment status is still being confirmed",
          ),
        );
    }
  }, [cartItems, load, params, remove, user]);
  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  async function changeAddress(order) {
    setError("");
    setAddressChangeOrderId(order._id);
    setBusy(order._id);
    try {
      const { data } = await api.get("/profile");
      const list = data.profile.addresses || [];
      if (!list.length) {
        setAddressMode("new");
      } else {
        setAddressMode("saved");
      }
      setSavedAddresses(list);
      setSelectedAddressId(
        list.find((address) => address.isDefault)?._id || list[0]?._id || "",
      );
      setNewAddress({
        ...emptyAddress,
        fullName: order.shippingAddress?.fullName || user.name || "",
        phone: order.shippingAddress?.phone || user.phone || "",
        country: order.shippingAddress?.country || "India",
      });
    } catch (e) {
      setAddressChangeOrderId("");
      setError(e.response?.data?.message || "Could not load saved addresses.");
    } finally {
      setBusy("");
    }
  }
  async function saveAddressChange(order) {
    const selectedAddress = savedAddresses.find(
      (address) => address._id === selectedAddressId,
    );
    const shippingAddress =
      addressMode === "saved" ? selectedAddress : newAddress;
    if (!shippingAddress) {
      setError("Choose a saved address or enter a new delivery address.");
      return;
    }
    if (
      addressMode === "new" &&
      (!shippingAddress.fullName.trim() ||
        !shippingAddress.phone.trim() ||
        !shippingAddress.line1.trim() ||
        !shippingAddress.city.trim() ||
        !shippingAddress.state.trim() ||
        !shippingAddress.postalCode.trim() ||
        !/^\+?[0-9 ()-]{8,20}$/.test(shippingAddress.phone))
    ) {
      setError(
        "Enter a valid name, phone, street address, city, state, and postal code.",
      );
      return;
    }
    setError("");
    setBusy(order._id);
    try {
      await api.patch(`/orders/${order._id}/address`, {
        shippingAddress,
      });
      setNotice("Delivery address updated.");
      setAddressChangeOrderId("");
      await load();
    } catch (e) {
      setError(
        e.response?.data?.message || "Address cannot be changed for this order",
      );
    } finally {
      setBusy("");
    }
  }
  async function cancelOrder(order) {
    const paidOnline =
      order.paymentMethod === "cashfree" && order.paymentStatus === "paid";
    if (
      !window.confirm(
        paidOnline
          ? `Cancel paid order #${String(order._id).slice(-8).toUpperCase()}? The order will be cancelled and reserved stock restored, but the Cashfree refund will need to be handled manually.`
          : `Cancel order #${String(order._id).slice(-8).toUpperCase()}? Reserved stock will be restored.`,
      )
    )
      return;
    setBusy(order._id);
    setError("");
    try {
      await api.post(`/orders/${order._id}/cancel`);
      setNotice(
        paidOnline
          ? "Order cancelled and stock restored. Contact support to arrange the Cashfree refund."
          : "Order cancelled. Reserved product stock has been restored.",
      );
    } catch (e) {
      setError(e.response?.data?.message || "Could not cancel this order.");
      setBusy("");
      return;
    }
    async function requestReturn(order) {
      setError("");
      setBusy(order._id);
      try {
        await api.post(`/orders/${order._id}/return`, {
          reason: returnReason,
        });
        setReturnOrderId("");
        setReturnReason("");
        setNotice("Return request submitted. The Admin will review it.");
        await load();
      } catch (e) {
        setError(e.response?.data?.message || "Could not request a return.");
      } finally {
        setBusy("");
      }
    }
    try {
      await load();
    } catch {
      setError("Order cancelled, but the order list could not be refreshed.");
    }
    setBusy("");
  }
  return (
    <section className="section orders-page">
      <span className="eyebrow">YOUR PURCHASES</span>
      <h1 className="account-title">
        {orderId ? (
          <>
            Order <em>details.</em>
          </>
        ) : (
          <>
            My <em>orders.</em>
          </>
        )}
      </h1>
      <p className="account-intro">
        Track each order, review its delivery address and check payment status.
      </p>
      <p className="orders-support-link">
        Need help with an order?{" "}
        <Link to="/support">Contact customer support</Link>.
      </p>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="notice error">{error}</p>}
      {orderId && (
        <Link className="order-details-back" to="/orders">
          <ArrowLeft size={17} /> Back to my orders
        </Link>
      )}
      {orderId && !ordersLoaded ? (
        <div className="loading-state">Loading your order…</div>
      ) : orderId && !orders.some((order) => order._id === orderId) ? (
        <div className="empty-products">
          <h3>Order not found.</h3>
          <p>This order may no longer be available.</p>
          <Link className="btn btn-dark" to="/orders">
            Back to my orders
          </Link>
        </div>
      ) : !orders.length ? (
        <div className="empty-products">
          <h3>No orders yet.</h3>
          <p>Your next favourite fragrance is waiting.</p>
          <Link className="btn btn-dark" to="/shop">
            Explore the shop
          </Link>
        </div>
      ) : (
        <div
          className={`orders-list${orderId ? " order-details-list" : ""}`}
        >
          {orders
            .filter((order) => !orderId || order._id === orderId)
            .map((o) =>
              !orderId ? (
                <Link
                  className="order-card order-list-card"
                  key={o._id}
                  to={`/orders/${o._id}`}
                >
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
                  <div className="order-list-preview">
                    <span className="order-list-icon">
                      <Package size={22} />
                    </span>
                    <span className="order-list-items">
                      {o.items
                        .slice(0, 2)
                        .map((item) => `${item.name} × ${item.quantity}`)
                        .join(", ")}
                      {o.items.length > 2
                        ? ` + ${o.items.length - 2} more`
                        : ""}
                    </span>
                  </div>
                  <div className="order-list-footer">
                    <span>
                      {o.items.length} item{o.items.length === 1 ? "" : "s"}
                      <strong>₹{o.total}</strong>
                    </span>
                    <span className="order-list-open">
                      View order <ArrowRight size={17} />
                    </span>
                  </div>
                </Link>
              ) : (
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
              <div
                className="order-card-details"
                id={`order-details-${o._id}`}
              >
              <div className="order-products">
                {o.items.map((i, n) => (
                  <div key={`${i.product}-${n}`}>
                    <span>
                      <span>
                        {i.name} × {i.quantity}
                      </span>
                      <small>
                        {i.returnable === false
                            ? "Non-returnable"
                            : Number.isInteger(i.returnWindowDays) &&
                                i.returnWindowDays > 0
                            ? `Return window: ${i.returnWindowDays} ${
                              i.returnWindowDays === 1
                                ? "day"
                                : "days"
                              } after delivery`
                            : "Non-returnable (no return window saved)"}
                      </small>
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
                      : "Cash on Delivery (legacy order)"}{" "}
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
                  {o.returnRequest?.status &&
                    o.returnRequest.status !== "none" && (
                      <div className="order-return-status">
                        <b>
                          Return: {o.returnRequest.status.replaceAll("_", " ")}
                        </b>
                        <p>{o.returnRequest.reason}</p>
                        {o.refund?.status &&
                          o.refund.status !== "not_requested" && (
                            <small>Cashfree refund: {o.refund.status}</small>
                          )}
                      </div>
                    )}
                  {o.status === "delivered" &&
                    o.deliveredAt &&
                    (!o.returnRequest || o.returnRequest.status === "none") &&
                    getOrderReturnWindowDays(o) === null && (
                      <p className="order-return-status">
                        This order contains a non-returnable product and cannot
                        be returned.
                      </p>
                    )}
                  {o.status === "delivered" &&
                    o.deliveredAt &&
                    (!o.returnRequest || o.returnRequest.status === "none") &&
                    getOrderReturnWindowDays(o) !== null &&
                    now <=
                      new Date(o.deliveredAt).getTime() +
                        getOrderReturnWindowDays(o) *
                          24 *
                          60 *
                          60 *
                          1000 && (
                      <div className="order-return-action">
                        {returnOrderId === o._id ? (
                          <>
                            <label>
                              Why are you returning this order?
                              <textarea
                                maxLength="500"
                                value={returnReason}
                                onChange={(event) =>
                                  setReturnReason(event.target.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="btn btn-dark"
                              disabled={busy === o._id || !returnReason.trim()}
                              onClick={() => requestReturn(o)}
                            >
                              {busy === o._id
                                ? "Submitting…"
                                : "Submit return request"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={busy === o._id}
                              onClick={() => setReturnOrderId("")}
                            >
                              Keep order
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => setReturnOrderId(o._id)}
                            >
                              Request a return
                            </button>
                            <small>
                              Request within{" "}
                              {getOrderReturnWindowDays(o)}{" "}
                              {getOrderReturnWindowDays(o) === 1
                                ? "day"
                                : "days"}{" "}
                              of delivery. This order has different product
                              return windows; all items must still be eligible.
                              Refund is processed after returned items are
                              received.
                            </small>
                          </>
                        )}
                      </div>
                    )}
                </div>
              )}
              <div className="timeline">
                {(o.statusHistory?.length
                  ? o.statusHistory
                  : [{ status: o.status, at: o.updatedAt }]
                ).map((h, i) => (
                  <div className="timeline-item" key={`${h.status}-${i}`}>
                    <div>
                      <div className="timeline-item-heading">
                        <i />
                        <b>{h.status}</b>
                      </div>
                      <p>{h.note || ""}</p>
                      <small>{new Date(h.at).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
              </div>
              {["pending", "paid", "processing"].includes(o.status) &&
                o.addressChangeAllowed && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy === o._id}
                      onClick={() =>
                        addressChangeOrderId === o._id
                          ? setAddressChangeOrderId("")
                          : changeAddress(o)
                      }
                    >
                      {busy === o._id
                        ? "Loading addresses…"
                        : addressChangeOrderId === o._id
                          ? "Close address selector"
                          : "Change delivery address"}
                    </button>
                    {addressChangeOrderId === o._id && (
                      <div className="order-address-editor">
                        <div className="order-previous-address">
                          <b>Current delivery address</b>
                          <span>
                            {o.shippingAddress?.fullName},{" "}
                            {o.shippingAddress?.line1}
                            {o.shippingAddress?.line2
                              ? `, ${o.shippingAddress.line2}`
                              : ""}
                            , {o.shippingAddress?.city},{" "}
                            {o.shippingAddress?.state}{" "}
                            {o.shippingAddress?.postalCode}
                          </span>
                        </div>
                        {savedAddresses.length > 0 && (
                          <div className="order-address-modes">
                            <button
                              type="button"
                              className={`btn ${addressMode === "saved" ? "btn-dark" : "btn-outline"}`}
                              onClick={() => setAddressMode("saved")}
                            >
                              Use saved address
                            </button>
                            <button
                              type="button"
                              className={`btn ${addressMode === "new" ? "btn-dark" : "btn-outline"}`}
                              onClick={() => setAddressMode("new")}
                            >
                              Enter new address
                            </button>
                          </div>
                        )}
                        {addressMode === "saved" &&
                        savedAddresses.length > 0 ? (
                          <>
                            <label htmlFor={`address-${o._id}`}>
                              Choose a saved delivery address
                            </label>
                            <select
                              id={`address-${o._id}`}
                              value={selectedAddressId}
                              onChange={(event) =>
                                setSelectedAddressId(event.target.value)
                              }
                            >
                              {savedAddresses.map((address) => (
                                <option key={address._id} value={address._id}>
                                  {address.label || "Address"} — {address.line1}
                                  , {address.city}
                                  {address.isDefault ? " (Default)" : ""}
                                </option>
                              ))}
                            </select>
                            <div className="order-address-preview">
                              {
                                savedAddresses.find(
                                  (address) =>
                                    address._id === selectedAddressId,
                                )?.fullName
                              }
                              {", "}
                              {
                                savedAddresses.find(
                                  (address) =>
                                    address._id === selectedAddressId,
                                )?.line1
                              }
                              {", "}
                              {
                                savedAddresses.find(
                                  (address) =>
                                    address._id === selectedAddressId,
                                )?.city
                              }
                            </div>
                          </>
                        ) : (
                          <div className="order-new-address-fields">
                            {[
                              ["fullName", "Full name", true],
                              ["phone", "Phone number", true],
                              ["line1", "Address line 1", true],
                              ["line2", "Address line 2", false],
                              ["city", "City", true],
                              ["state", "State", true],
                              ["postalCode", "Postal code", true],
                              ["country", "Country", true],
                              ["landmark", "Landmark", false],
                            ].map(([field, label, required]) => (
                              <label key={field}>
                                {label}
                                <input
                                  required={required}
                                  value={newAddress[field]}
                                  onChange={(event) =>
                                    setNewAddress((current) => ({
                                      ...current,
                                      [field]: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="order-address-actions">
                          <button
                            type="button"
                            className="btn btn-dark"
                            disabled={
                              busy === o._id ||
                              (addressMode === "saved" && !selectedAddressId)
                            }
                            onClick={() => saveAddressChange(o)}
                          >
                            {busy === o._id ? "Saving…" : "Save address"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={busy === o._id}
                            onClick={() => setAddressChangeOrderId("")}
                          >
                            Keep current address
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              {["pending", "paid", "processing"].includes(o.status) && (
                <>
                  {(() => {
                    const cancellationExpired =
                      now - new Date(o.createdAt).getTime() >=
                      cancellationWindowMs;
                    const paidOnline =
                      o.paymentMethod === "cashfree" &&
                      o.paymentStatus === "paid";
                    return (
                      <div className="order-cancel-action">
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busy === o._id || cancellationExpired}
                          title={
                            paidOnline
                              ? "You can cancel within 6 hours; any Cashfree refund must be handled manually."
                              : cancellationExpired
                                ? "The 6-hour cancellation window has ended."
                                : undefined
                          }
                          onClick={() => cancelOrder(o)}
                        >
                          {busy === o._id
                            ? "Cancelling…"
                            : cancellationExpired
                              ? "Cancellation window closed"
                              : "Cancel order"}
                        </button>
                        {paidOnline && !cancellationExpired && (
                          <small>
                            You can cancel this order within 6 hours. Cashfree
                            refunds are handled manually; contact support after
                            cancelling.
                          </small>
                        )}
                        {!paidOnline && cancellationExpired && (
                          <small>
                            Customer cancellation is available only within 6
                            hours of placing the order.
                          </small>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
                </div>
            </article>
              ),
            )}
        </div>
      )}
    </section>
  );
}
