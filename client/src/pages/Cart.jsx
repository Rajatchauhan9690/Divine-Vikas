import { Link, Navigate, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from "lucide-react";
import { createPortal } from "react-dom";
import { useCart } from "../features/cart/CartContext";
import { useAuth } from "../features/auth/AuthContext";
import { api } from "../services/api";
import { useEffect, useRef, useState } from "react";
import CashfreeCustomCheckout from "../components/CashfreeCustomCheckout";
import PaymentSuccess from "../components/PaymentSuccess";
import ErrorToast from "../components/ErrorToast";
import Seo from "../components/Seo";
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

function getCourierLabel(courier) {
  if (!courier) return "";
  return courier.badges?.includes("Fastest")
    ? "Fastest delivery"
    : "Delivery estimate unavailable";
}

function getDeliveryEstimate(courier) {
  if (courier.estimatedDate) {
    const timestamp = Date.parse(courier.estimatedDate);
    if (Number.isFinite(timestamp)) {
      const expectedDate = new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(timestamp);
      return `Expected by ${expectedDate}`;
    }
  }
  return courier.estimatedDays
    ? `Estimated ${courier.estimatedDays} days`
    : "Delivery estimate unavailable";
}

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
  const [shippingQuote, setShippingQuote] = useState(null);
  const [quoteLoadingKey, setQuoteLoadingKey] = useState("");
  const [quoteErrorKey, setQuoteErrorKey] = useState("");
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [checkoutStep, setCheckoutStep] = useState("cart");
  const requestedQuoteKey = useRef("");
  const [couponSearch, setCouponSearch] = useState("");
  const [couponSuggestions, setCouponSuggestions] = useState([]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const couponItems = items.map((item) => ({
    product: item._id,
    quantity: item.qty,
  }));
  const couponItemsKey = JSON.stringify(couponItems);
  const currentCoupon =
    appliedCoupon?.itemsKey === couponItemsKey ? appliedCoupon : null;
  const deliveryAddress =
    (!newAddress && addresses.find((saved) => saved._id === selected)) ||
    address;
  const shippingQuoteKey = JSON.stringify({
    postalCode: deliveryAddress.postalCode || "",
    items: items.map((item) => ({
      product: item._id,
      quantity: item.qty,
      price: item.price,
    })),
  });
  const currentShippingQuote =
    shippingQuote?.key === shippingQuoteKey ? shippingQuote : null;
  const quoteLoading = quoteLoadingKey === shippingQuoteKey;
  const quoteError = quoteErrorKey === shippingQuoteKey;
  const canRequestShippingQuote =
    ["fullName", "phone", "line1", "city", "state", "postalCode"].every(
      (field) =>
        typeof deliveryAddress[field] === "string" &&
        deliveryAddress[field].trim(),
    ) && /^\+?[0-9 ()-]{8,20}$/.test(deliveryAddress.phone);
  useEffect(() => {
    if (
      !profileLoaded ||
      !user ||
      user.role === "admin" ||
      !items.length ||
      !canRequestShippingQuote ||
      currentShippingQuote ||
      requestedQuoteKey.current === shippingQuoteKey
    ) {
      return undefined;
    }

    let active = true;
    requestedQuoteKey.current = shippingQuoteKey;
    setQuoteLoadingKey(shippingQuoteKey);
    setQuoteErrorKey("");

    const timer = window.setTimeout(() => {
      api
        .post("/orders/shipping-quotes", {
          items: items.map((item) => ({
            product: item._id,
            quantity: item.qty,
          })),
          shippingAddress: deliveryAddress,
        })
        .then(({ data }) => {
          if (!active) return;
          setShippingQuote({ key: shippingQuoteKey, couriers: data.couriers });
          const defaultCourier =
            data.couriers.find((courier) =>
              courier.badges?.includes("Fastest"),
            ) || data.couriers[0];
          setSelectedCourierId(defaultCourier ? String(defaultCourier.id) : "");
        })
        .catch((error) => {
          if (!active) return;
          requestedQuoteKey.current = "";
          setQuoteErrorKey(shippingQuoteKey);
          setMessage(
            error.response?.data?.message ||
              "Could not check delivery options. Please try again.",
          );
        })
        .finally(() => {
          if (active) setQuoteLoadingKey("");
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    profileLoaded,
    user,
    items.length,
    deliveryAddress,
    shippingQuoteKey,
    currentShippingQuote,
    quoteRetry,
    canRequestShippingQuote,
  ]);
  useEffect(() => {
    if (checkoutStep === "confirmation" && !currentShippingQuote) {
      setCheckoutStep("cart");
    }
  }, [checkoutStep, currentShippingQuote]);
  const selectedCourier = currentShippingQuote?.couriers.find(
    (courier) => String(courier.id) === selectedCourierId,
  );
  const selectedCourierLabel = getCourierLabel(selectedCourier);
  const currentCouponDiscount =
    currentCoupon?.discountType === "shipping"
      ? selectedCourier?.rate || 0
      : currentCoupon?.discountAmount || 0;
  const orderTotal = Number(
    (total - currentCouponDiscount + (selectedCourier?.rate || 0)).toFixed(2),
  );
  useEffect(() => {
    const search = couponSearch.trim();
    if (search.length < 2 || !items.length || currentCoupon) {
      setCouponSuggestions([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.post("/orders/coupons/search", {
          search,
          items: couponItems,
          shippingCost: selectedCourier?.rate || 0,
        });
        if (active) setCouponSuggestions(data.coupons || []);
      } catch {
        if (active)
          setCouponMessage("Could not search coupons. Please try again.");
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    couponSearch,
    couponItemsKey,
    Boolean(currentCoupon),
    selectedCourier?.rate,
  ]);
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
  async function applyCoupon(code = couponSearch) {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;
    setCouponBusy(true);
    setCouponMessage("");
    try {
      const { data } = await api.post("/orders/coupons/validate", {
        code: normalizedCode,
        items: couponItems,
        shippingCost: selectedCourier?.rate || 0,
      });
      setAppliedCoupon({ ...data.coupon, itemsKey: couponItemsKey });
      setCouponSearch(data.coupon.code);
      setCouponSuggestions([]);
    } catch (error) {
      setAppliedCoupon(null);
      setCouponMessage(
        error.response?.data?.message || "This coupon could not be applied.",
      );
    } finally {
      setCouponBusy(false);
    }
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
    if (!currentShippingQuote) {
      setMessage(
        canRequestShippingQuote
          ? "Delivery options are still loading. Please wait a moment."
          : "Complete your delivery address to check delivery options.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let ship =
        (!newAddress && addresses.find((saved) => saved._id === selected)) ||
        address;
      if (checkoutStep === "cart") {
        if (!selectedCourier) {
          setMessage("Choose a delivery option before reviewing your order.");
          return;
        }
        setCheckoutStep("confirmation");
        return;
      }
      if (!selectedCourier) {
        setMessage("Choose a delivery option before continuing to payment.");
        return;
      }
      ship = addresses.find((saved) => saved._id === selected);
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
        shippingCourierId: selectedCourier.id,
        shippingRate: selectedCourier.rate,
        couponCode: currentCoupon?.code || "",
      });
      if (!data.payment?.paymentSessionId)
        throw new Error("Cashfree did not return a payment session.");
      if (data.payment.coupon)
        setAppliedCoupon({ ...data.payment.coupon, itemsKey: couponItemsKey });
      setPayment({
        ...data.payment,
        attemptId: data.attemptId,
        total: data.payment.total,
        phone: ship.phone,
        cartProductIds: items.map((item) => item._id),
        summaryDescription: [
          ...items.map((item) => `${item.name} × ${item.qty}`),
          ...(data.payment.coupon
            ? [`Coupon ${data.payment.coupon.code} −₹${data.payment.discountAmount.toFixed(2)}`]
            : []),
          `Delivery (${selectedCourierLabel}) ₹${selectedCourier.rate.toFixed(2)}`,
        ].join(", "),
      });
      setCheckoutActive(true);
      setMessage("");
    } catch (e) {
      if (
        ["SHIPPING_QUOTE_CHANGED", "SHIPPING_OPTION_UNAVAILABLE"].includes(
          e.response?.data?.code,
        )
      ) {
        setShippingQuote(null);
        setSelectedCourierId("");
      }
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
        ...(Number(data.order.discountAmount) > 0
          ? [
              {
                label: `Coupon${data.order.coupon?.code ? ` (${data.order.coupon.code})` : ""}`,
                value: `−${Number(data.order.discountAmount).toLocaleString("en-IN", {
                  style: "currency",
                  currency: "INR",
                })}`,
              },
            ]
          : []),
        {
          label: "Delivery",
          value: Number(data.order.shippingCost || 0).toLocaleString("en-IN", {
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
      <Seo
        title="Your Shopping Cart"
        description="Review your Divine Vikas fragrance selections and continue to secure checkout."
        robots="noindex, follow"
      />
      <ErrorToast error={message} onDismiss={() => setMessage("")} />
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
          <div className="class-exit-overlay confirm-overlay">
            <section
              className="class-exit-dialog confirm-dialog"
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
              <div className="class-exit-actions inline-actions admin-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowPaymentExitConfirm(false)}
                >
                  Continue payment
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
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
      <button
        type="button"
        className="cart-back-link btn class-flow-button class-flow-button--gold"
        onClick={() =>
          checkoutStep === "confirmation"
            ? setCheckoutStep("cart")
            : nav("/shop")
        }
      >
        <ArrowLeft size={16} /> Back
      </button>
      <span className="eyebrow">
        {checkoutStep === "confirmation"
          ? "CHECKOUT · REVIEW ORDER"
          : "YOUR SELECTION"}
      </span>
      <h1>
        {checkoutStep === "confirmation" ? (
          <>
            Review your <em>order.</em>
          </>
        ) : (
          <>
            Your <em>bag.</em>
          </>
        )}
      </h1>
      {checkoutStep === "confirmation" && (
        <p className="checkout-review-intro">
          Check your items, delivery address, and delivery speed before payment.
        </p>
      )}
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
            {checkoutStep === "confirmation" ? (
              <>
                <div className="checkout-panel checkout-address-review">
                  <div className="checkout-review-heading">
                    <h2>Delivery address</h2>
                    <button
                      type="button"
                      className="cart-action-link"
                      onClick={() => setCheckoutStep("cart")}
                    >
                      Edit
                    </button>
                  </div>
                  <p>
                    <strong>{deliveryAddress.fullName}</strong>
                    <br />
                    {deliveryAddress.line1}
                    {deliveryAddress.line2 ? `, ${deliveryAddress.line2}` : ""}
                    <br />
                    {deliveryAddress.city}, {deliveryAddress.state}{" "}
                    {deliveryAddress.postalCode}
                    <br />
                    {deliveryAddress.phone}
                  </p>
                </div>
                <div className="checkout-panel checkout-review-items">
                  <div className="checkout-review-heading">
                    <h2>Items in your order</h2>
                    <button
                      type="button"
                      className="cart-action-link"
                      onClick={() => setCheckoutStep("cart")}
                    >
                      Edit bag
                    </button>
                  </div>
                  {items.map((item) => (
                    <article className="checkout-review-item" key={item._id}>
                      {item.image && <img src={item.image} alt={item.name} />}
                      <span>
                        <strong>{item.name}</strong>
                        <small>Quantity: {item.qty}</small>
                      </span>
                      <b>
                        ₹{(Number(item.price) * Number(item.qty)).toFixed(2)}
                      </b>
                    </article>
                  ))}
                </div>
              </>
            ) : (
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
            )}
            {checkoutStep === "cart" && (
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
            )}
          </div>
          <aside className="order-summary">
            <h2>Order summary</h2>
            <div>
              <span>Subtotal</span>
              <b>₹{total}</b>
            </div>
            {checkoutStep === "cart" && (
              <section className="cart-coupon" aria-label="Apply a coupon">
                <label htmlFor="cart-coupon-search">Coupon code</label>
                {currentCoupon ? (
                  <div className="cart-coupon-applied">
                    <span>
                      <b>{currentCoupon.code}</b>
                      <small>
                        {currentCoupon.discountType === "shipping"
                          ? "Free delivery applied"
                          : "Coupon applied"}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="cart-action-link"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponSearch("");
                        setCouponMessage("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="cart-coupon-entry">
                      <input
                        id="cart-coupon-search"
                        value={couponSearch}
                        autoComplete="off"
                        placeholder="Search or enter a code"
                        onChange={(event) => {
                          setCouponSearch(event.target.value.toUpperCase());
                          setCouponMessage("");
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={couponBusy || !couponSearch.trim()}
                        onClick={() => applyCoupon()}
                      >
                        {couponBusy ? "Checking…" : "Apply"}
                      </button>
                    </div>
                    {couponSuggestions.length > 0 && (
                      <div className="cart-coupon-suggestions">
                        {couponSuggestions.map((coupon) => (
                          <button
                            type="button"
                            key={coupon.code}
                            onClick={() => applyCoupon(coupon.code)}
                          >
                            <span>
                              <b>{coupon.code}</b>
                              <small>
                                {coupon.description ||
                                  (coupon.discountType === "shipping"
                                    ? "Free delivery"
                                    : coupon.discountType === "percent"
                                      ? `${coupon.value}% off`
                                      : `₹${coupon.value} off`)}
                              </small>
                            </span>
                            <strong>
                              {coupon.discountType === "shipping" &&
                              !selectedCourier
                                ? "Free delivery"
                                : `Save ₹${coupon.discountAmount.toFixed(2)}`}
                            </strong>
                          </button>
                        ))}
                      </div>
                    )}
                    {couponMessage && (
                      <small className="cart-coupon-message" role="status">
                        {couponMessage}
                      </small>
                    )}
                  </>
                )}
              </section>
            )}
            {currentCoupon && (
              <div className="cart-coupon-discount">
                <span>
                  {currentCoupon.discountType === "shipping"
                    ? "Delivery discount"
                    : "Coupon discount"}
                </span>
                <b>
                  {currentCoupon.discountType === "shipping" && !selectedCourier
                    ? "Free delivery"
                    : `−₹${currentCouponDiscount.toFixed(2)}`}
                </b>
              </div>
            )}
            <div>
              <span>Shipping</span>
              <span>
                {selectedCourier
                  ? checkoutStep === "confirmation"
                    ? `${selectedCourierLabel} · ${selectedCourier.estimatedDays ? `${selectedCourier.estimatedDays} days · ` : ""}₹${selectedCourier.rate.toFixed(2)}`
                    : `${selectedCourierLabel} · ₹${selectedCourier.rate.toFixed(2)}`
                  : checkoutStep === "cart"
                    ? quoteLoading
                      ? "Checking options…"
                      : canRequestShippingQuote
                        ? "Loading options…"
                        : "Complete address to check"
                    : "Choose delivery"}
              </span>
            </div>
            {quoteLoading && checkoutStep === "cart" && (
              <div className="delivery-loading" role="status" aria-live="polite">
                <span className="delivery-loading-spinner" aria-hidden="true" />
                <span>Checking delivery options for your location…</span>
              </div>
            )}
            {quoteError && checkoutStep === "cart" && (
              <div className="delivery-loading" role="status">
                <span>We couldn’t load delivery options.</span>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    requestedQuoteKey.current = "";
                    setQuoteErrorKey("");
                    setMessage("");
                    setQuoteRetry((retry) => retry + 1);
                  }}
                >
                  Try again
                </button>
              </div>
            )}
            {!canRequestShippingQuote &&
              !currentShippingQuote &&
              !quoteLoading &&
              !quoteError &&
              checkoutStep === "cart" && (
                <div className="delivery-loading" role="status">
                  <span>
                    Complete your delivery address to see available delivery options.
                  </span>
                </div>
              )}
            {checkoutStep === "cart" &&
              currentShippingQuote &&
              currentShippingQuote.couriers.length > 0 && (
                <section
                  className="delivery-options"
                  aria-labelledby="delivery-options-title"
                >
                  <div className="delivery-options-heading">
                    <h3 id="delivery-options-title">Delivery options</h3>
                    <span>{currentShippingQuote.couriers.length} options</span>
                  </div>
                  {currentShippingQuote.couriers.map((courier) => {
                    const isSelected =
                      selectedCourierId === String(courier.id);
                    return (
                      <label
                        className={`delivery-option-row${isSelected ? " is-selected" : ""}`}
                        key={courier.id}
                      >
                        <input
                          type="radio"
                          name="shippingCourier"
                          value={courier.id}
                          checked={isSelected}
                          onChange={() =>
                            setSelectedCourierId(String(courier.id))
                          }
                        />
                        <span className="delivery-option-main">
                          <span className="delivery-option-name">
                            {getCourierLabel(courier)}
                          </span>
                          <span className="delivery-option-meta">
                            {getDeliveryEstimate(courier)}
                          </span>
                        </span>
                        <span className="delivery-option-price">
                          ₹{courier.rate.toFixed(2)}
                        </span>
                      </label>
                    );
                  })}
                </section>
              )}
            {checkoutStep === "cart" &&
              currentShippingQuote &&
              !currentShippingQuote.couriers.length && (
                <div className="delivery-unavailable" role="status">
                  <span
                    className="delivery-unavailable-icon"
                    aria-hidden="true"
                  >
                    !
                  </span>
                  <div className="delivery-unavailable-content">
                    <b>Delivery isn’t possible for this location</b>
                    <span>
                      We don’t currently have a courier service to this postcode.
                      Try another address or contact the store for help.
                    </span>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setShippingQuote(null);
                        setSelectedCourierId("");
                        setMessage("");
                        setNewAddress(true);
                      }}
                    >
                      Try another address
                    </button>
                  </div>
                </div>
              )}
            <div className="summary-total">
              <span>Total</span>
              <strong>₹{orderTotal.toFixed(2)}</strong>
            </div>
            {checkoutStep === "confirmation" && (
              <>
                <h3 className="payment-heading">Payment</h3>
                <div className="payment-option payment-option-fixed checkout-review-payment">
                  <span>
                    <b>Pay online with Cashfree</b>
                    <small>Secure payment with UPI, cards and more</small>
                  </span>
                </div>
              </>
            )}
            {message && <p className="notice error">{message}</p>}
            <button
              className="btn class-flow-button class-flow-button--gold btn-full"
              disabled={
                busy ||
                quoteLoading ||
                (checkoutStep === "cart" &&
                  (!currentShippingQuote || !selectedCourier)) ||
                (checkoutStep === "confirmation" && !selectedCourier)
              }
            >
              {busy
                ? "Please wait…"
                : quoteLoading
                  ? "Loading delivery options…"
                : checkoutStep === "confirmation"
                  ? "Continue to payment"
                  : "Continue"}
            </button>
          </aside>
        </form>
      )}
    </section>
  );
}
