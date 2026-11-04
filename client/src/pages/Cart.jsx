import { Link, Navigate, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from "lucide-react";
import { createPortal } from "react-dom";
import { useCart } from "../features/cart/CartContext";
import { useAuth } from "../features/auth/AuthContext";
import { api } from "../services/api";
import { useEffect, useState } from "react";
import CashfreeCustomCheckout from "../components/CashfreeCustomCheckout";
import PaymentSuccess from "../components/PaymentSuccess";
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
export default function Cart() {
  const { items, remove, change, total } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentSuccessDetails, setPaymentSuccessDetails] = useState([]);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [showPaymentExitConfirm, setShowPaymentExitConfirm] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [newAddress, setNewAddress] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    if (!showPaymentExitConfirm) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowPaymentExitConfirm(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPaymentExitConfirm]);
  useEffect(() => {
    if (!user || user.role === "admin") return;
    api
        .get("/profile")
        .then((r) => {
          const a = r.data.profile.addresses || [];
          setAddresses(a);
          setSelected(a.find((x) => x.isDefault)?._id || a[0]?._id || "");
          setProfileLoaded(true);
          if (r.data.profile.name)
            setAddress((v) => ({
              ...v,
              fullName: r.data.profile.name,
              phone: r.data.profile.phone || "",
            }));
        })
        .catch((error) =>
          setMessage(
            error.response?.data?.message ||
              "Could not load your profile. Refresh before continuing to checkout.",
          ),
        );
  }, [user]);
  function setField(k, v) {
    setAddress((a) => ({ ...a, [k]: v }));
  }
  async function checkout(e) {
    e.preventDefault();
    if (!user) return nav("/login", { state: { from: "/cart" } });
    if (!items.length) return;
    if (payment) {
      setCheckoutActive(true);
      return;
    }
    if (!profileLoaded) {
      setMessage(
        "Your profile details could not be loaded. Refresh before continuing to checkout.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let ship = addresses.find((a) => a._id === selected);
      if (newAddress || !ship) {
        if (addresses.length < 3) {
          const { data } = await api.post("/profile/addresses", {
            ...address,
            isDefault: addresses.length === 0,
          });
          ship = data.addresses?.[data.addresses.length - 1];
          setAddresses(data.addresses || []);
          setSelected(ship?._id || "");
        } else {
          ship = address;
        }
      }
      if (!ship) throw new Error("Please select or enter a delivery address.");
      const { data } = await api.post("/orders", {
        items: items.map((i) => ({ product: i._id, quantity: i.qty })),
        shippingAddress: ship,
        paymentMethod: "cashfree",
      });
      if (!data.payment?.paymentSessionId)
        throw new Error("Cashfree did not return a payment session.");
      setPayment({
        ...data.payment,
        attemptId: data.attemptId,
        total,
        phone: ship.phone,
        cartProductIds: items.map((item) => item._id),
        summaryDescription: items
          .map((item) => `${item.name} × ${item.qty}`)
          .join(", "),
      });
      setCheckoutActive(true);
      setMessage("");
    } catch (e) {
      setMessage(
        e.response?.data?.message ||
          e.message ||
          "Could not place order. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function verifyPayment() {
    const { data } = await api.post(
      `/orders/${payment.attemptId}/verify-payment`,
    );
    if (data.paymentStatus === "paid" && data.order) {
      payment.cartProductIds.forEach((productId) => remove(productId));
      setPaymentSuccessDetails([
        {
          label: "Order",
          value: `#${String(data.order._id).slice(-8).toUpperCase()}`,
        },
        {
          label: "Items",
          value: data.order.items
            .map((item) => `${item.name} × ${item.quantity}`)
            .join(", "),
        },
        {
          label: "Total",
          value: Number(data.order.total).toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
          }),
        },
      ]);
      setPayment(null);
      setCheckoutActive(false);
      setPaymentSuccess(true);
    } else if (
      data.paymentStatus === "failed" ||
      data.paymentStatus === "expired"
    ) {
      setPayment(null);
      setCheckoutActive(false);
      setMessage(
        data.paymentStatus === "failed"
          ? "Payment was not completed. Your items are still in your bag; please try again."
          : "The payment session expired. Your items are still in your bag; please try again.",
      );
    } else if (data.paymentStatus === "refund_required") {
      setPayment(null);
      setCheckoutActive(false);
      setMessage(
        "Payment succeeded but could not be matched to available stock. Please contact support.",
      );
    }
    return data.paymentStatus;
  }
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  return (
    <section className="section cart-page">
      {paymentSuccess && (
        <PaymentSuccess
          title="Your order is confirmed"
          message="Your payment was received and your order has been placed."
          details={paymentSuccessDetails}
          returnTo="your orders"
          onClose={() => {
            setPaymentSuccess(false);
            nav("/orders", { replace: true });
          }}
        />
      )}
      {checkoutActive &&
        payment &&
        createPortal(
          <CashfreeCustomCheckout
            payment={payment}
            sessionTitle="Your fragrance order"
            price={payment.total}
            totalAmount={payment.total}
            checkoutTitle="Complete your order"
            summaryLabel="ORDER SUMMARY"
            summaryDescription={payment.summaryDescription}
            expiryLabel="Payment session expires"
            pendingMessage="Payment is processing. Your items are reserved while Cashfree confirms it."
            unconfirmedMessage="We could not confirm payment yet. Your items are reserved; please wait and try again."
            email={user?.email || ""}
            phone={payment.phone}
            onBack={() => setShowPaymentExitConfirm(true)}
            onPaymentComplete={verifyPayment}
          />,
          document.body,
        )}
      {showPaymentExitConfirm &&
        createPortal(
          <div className="class-exit-overlay">
            <section
              className="class-exit-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cart-payment-exit-title"
              aria-describedby="cart-payment-exit-description"
            >
              <div className="class-exit-icon" aria-hidden="true">
                <ShoppingBag size={23} />
              </div>
              <span className="eyebrow">SECURE CHECKOUT</span>
              <h2 id="cart-payment-exit-title">Leave payment?</h2>
              <p id="cart-payment-exit-description">
                You can continue paying now or exit checkout and return to your
                bag.
              </p>
              <div className="class-exit-actions">
                <button
                  type="button"
                  className="btn class-flow-button class-flow-button--green"
                  onClick={() => setShowPaymentExitConfirm(false)}
                >
                  Continue payment
                </button>
                <button
                  type="button"
                  className="btn class-flow-button class-flow-button--danger"
                  onClick={() => {
                    setShowPaymentExitConfirm(false);
                    setCheckoutActive(false);
                  }}
                >
                  Exit payment
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
      <Link
        className="cart-back-link btn class-flow-button class-flow-button--gold"
        to="/shop"
      >
        <ArrowLeft size={16} /> Back to shop
      </Link>
      <span className="eyebrow">YOUR SELECTION</span>
      <h1>
        Your <em>bag.</em>
      </h1>
      {!items.length ? (
        <div className="empty-products">
          <ShoppingBag size={35} />
          <h3>Your bag is taking a quiet moment.</h3>
          <p>Explore the collection and find a fragrance to call yours.</p>
          <Link className="btn btn-dark" to="/shop">
            Shop fragrances
          </Link>
        </div>
      ) : (
        <form className="cart-layout" onSubmit={checkout}>
          <div className="cart-items">
            <div className="checkout-panel">
              <h2>Delivery address</h2>
              {addresses.length > 0 && !newAddress && (
                <>
                  <label>
                    Choose a saved address
                    <select
                      required
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">Select address</option>
                      {addresses.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.label || "Address"} — {a.line1}, {a.city}
                          {a.isDefault ? " (Default)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="selected-address">
                    {addresses.find((a) => a._id === selected) &&
                      `${addresses.find((a) => a._id === selected).fullName}, ${addresses.find((a) => a._id === selected).line1}, ${addresses.find((a) => a._id === selected).city}, ${addresses.find((a) => a._id === selected).state} ${addresses.find((a) => a._id === selected).postalCode}`}
                  </div>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setNewAddress(true)}
                  >
                    Use a new address
                  </button>
                </>
              )}
              {(newAddress || !addresses.length) && (
                <>
                  <div className="account-form-grid">
                    <label>
                      Label
                      <input
                        required
                        value={address.label}
                        onChange={(e) => setField("label", e.target.value)}
                      />
                    </label>
                    <label>
                      Full name
                      <input
                        required
                        value={address.fullName}
                        onChange={(e) => setField("fullName", e.target.value)}
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        required
                        value={address.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                      />
                    </label>
                    <label>
                      Address line 1
                      <input
                        required
                        value={address.line1}
                        onChange={(e) => setField("line1", e.target.value)}
                      />
                    </label>
                    <label>
                      Address line 2
                      <input
                        value={address.line2}
                        onChange={(e) => setField("line2", e.target.value)}
                      />
                    </label>
                    <label>
                      City
                      <input
                        required
                        value={address.city}
                        onChange={(e) => setField("city", e.target.value)}
                      />
                    </label>
                    <label>
                      State
                      <input
                        required
                        value={address.state}
                        onChange={(e) => setField("state", e.target.value)}
                      />
                    </label>
                    <label>
                      Postal code
                      <input
                        required
                        value={address.postalCode}
                        onChange={(e) => setField("postalCode", e.target.value)}
                      />
                    </label>
                    <label>
                      Country
                      <input
                        required
                        value={address.country}
                        onChange={(e) => setField("country", e.target.value)}
                      />
                    </label>
                  </div>
                  {addresses.length > 0 && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setNewAddress(false)}
                    >
                      Use a saved address
                    </button>
                  )}
                </>
              )}
            </div>
            <div
              className="cart-product-list"
              role="region"
              aria-label="Products in your cart"
              tabIndex={0}
            >
              {items.map((i) => (
                <article className="cart-item" key={i._id}>
                  {i.image && <img src={i.image} alt={i.name} />}
                  <div className="cart-item-info">
                    <h3>{i.name}</h3>
                    <p>₹{i.price}</p>
                    <div className="qty-control">
                      <button
                        type="button"
                        disabled={Boolean(payment)}
                        onClick={() => change(i._id, i.qty - 1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={14} />
                      </button>
                      <span>{i.qty}</span>
                      <button
                        type="button"
                        disabled={Boolean(payment)}
                        onClick={() => change(i._id, i.qty + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={Boolean(payment)}
                    onClick={() => remove(i._id)}
                    aria-label={`Remove ${i.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
            </div>
          </div>
          <aside className="order-summary">
            <h2>Order summary</h2>
            <div>
              <span>Subtotal</span>
              <b>₹{total}</b>
            </div>
            <div>
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <div className="summary-total">
              <span>Total</span>
              <strong>₹{total}</strong>
            </div>
            <h3 className="payment-heading">Payment method</h3>
            <div className="payment-option payment-option-fixed">
              <span>
                <b>Pay online with Cashfree</b>
                <small>UPI, cards and supported payment methods</small>
              </span>
            </div>
            {message && <p className="notice error">{message}</p>}
            <button
              className="btn class-flow-button class-flow-button--gold btn-full"
              disabled={busy}
            >
              {busy ? "Processing…" : "Continue to payment"}
            </button>
          </aside>
        </form>
      )}
    </section>
  );
}
