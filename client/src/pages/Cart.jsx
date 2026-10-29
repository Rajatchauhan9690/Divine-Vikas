import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "../features/cart/CartContext";
import { useAuth } from "../features/auth/AuthContext";
import { api } from "../services/api";
import { useEffect, useState } from "react";
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
function launchCashfree(sessionId, environment) {
  return new Promise((resolve, reject) => {
    const go = () => {
      try {
        const cf = window.Cashfree({
          mode: environment === "production" ? "production" : "sandbox",
        });
        Promise.resolve(
          cf.checkout({ paymentSessionId: sessionId, redirectTarget: "_self" }),
        )
          .then(resolve)
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    };
    if (window.Cashfree) {
      go();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = go;
    script.onerror = () =>
      reject(new Error("Unable to load Cashfree checkout. Please try again."));
    document.head.appendChild(script);
  });
}
export default function Cart() {
  const { items, remove, change, total, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [newAddress, setNewAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cashfree");
  useEffect(() => {
    if (user)
      api
        .get("/profile")
        .then((r) => {
          const a = r.data.profile.addresses || [];
          setAddresses(a);
          setSelected(a.find((x) => x.isDefault)?._id || a[0]?._id || "");
          if (r.data.profile.name)
            setAddress((v) => ({
              ...v,
              fullName: r.data.profile.name,
              phone: r.data.profile.phone || "",
            }));
        })
        .catch(() => {});
  }, [user]);
  function setField(k, v) {
    setAddress((a) => ({ ...a, [k]: v }));
  }
  async function checkout(e) {
    e.preventDefault();
    if (!user) return nav("/login");
    if (!items.length) return;
    setBusy(true);
    setMessage("");
    try {
      let ship = addresses.find((a) => a._id === selected);
      if (newAddress || !ship) {
        const { data } = await api.post("/profile/addresses", {
          ...address,
          isDefault: addresses.length === 0,
        });
        ship = data.addresses?.[data.addresses.length - 1];
        setAddresses(data.addresses || []);
        setSelected(ship?._id || "");
      }
      if (!ship) throw new Error("Please select or enter a delivery address.");
      const { data } = await api.post("/orders", {
        items: items.map((i) => ({ product: i._id, quantity: i.qty })),
        shippingAddress: ship,
        paymentMethod,
      });
      if (paymentMethod === "cashfree") {
        if (!data.payment?.paymentSessionId)
          throw new Error("Cashfree did not return a payment session.");
        await launchCashfree(
          data.payment.paymentSessionId,
          data.payment.environment,
        );
        return;
      }
      clear?.();
      setMessage("Order placed successfully. Pay on delivery.");
      nav("/orders");
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
  return (
    <section className="section cart-page">
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
            {items.map((i) => (
              <article className="cart-item" key={i._id}>
                {i.image && <img src={i.image} alt={i.name} />}
                <div className="cart-item-info">
                  <h3>{i.name}</h3>
                  <p>₹{i.price}</p>
                  <div className="qty-control">
                    <button
                      type="button"
                      onClick={() => change(i._id, i.qty - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span>{i.qty}</span>
                    <button
                      type="button"
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
                  onClick={() => remove(i._id)}
                  aria-label={`Remove ${i.name}`}
                >
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
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
            <label className="payment-option">
              <input
                type="radio"
                name="paymentMethod"
                value="cashfree"
                checked={paymentMethod === "cashfree"}
                onChange={() => setPaymentMethod("cashfree")}
              />
              <span>
                <b>Pay online with Cashfree</b>
                <small>UPI, cards and supported payment methods</small>
              </span>
            </label>
            <label className="payment-option">
              <input
                type="radio"
                name="paymentMethod"
                value="cod"
                checked={paymentMethod === "cod"}
                onChange={() => setPaymentMethod("cod")}
              />
              <span>
                <b>Cash on Delivery</b>
                <small>Pay when your order arrives</small>
              </span>
            </label>
            {message && <p className="notice error">{message}</p>}
            <button className="btn btn-dark btn-full" disabled={busy}>
              {busy
                ? "Processing…"
                : paymentMethod === "cashfree"
                  ? "Continue to secure payment"
                  : "Place COD order"}
            </button>
            <small>Prices are recalculated securely by the server.</small>
          </aside>
        </form>
      )}
    </section>
  );
}
