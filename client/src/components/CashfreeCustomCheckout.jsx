import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CreditCard,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

let cashfreeScriptPromise;

const upiApps = [
  { id: "gpay", name: "Google Pay" },
  { id: "phonepe", name: "PhonePe" },
  { id: "paytm", name: "Paytm" },
];

function loadCashfreeSdk(environment) {
  const createClient = () => {
    if (typeof window.Cashfree !== "function")
      throw new Error("Cashfree checkout could not be initialized.");
    return window.Cashfree({
      mode: environment === "production" ? "production" : "sandbox",
    });
  };

  if (typeof window.Cashfree === "function") {
    return Promise.resolve().then(createClient);
  }

  if (!cashfreeScriptPromise) {
    cashfreeScriptPromise = new Promise((resolve, reject) => {
      let script = document.querySelector(
        'script[src="https://sdk.cashfree.com/js/v3/cashfree.js"]',
      );
      const onLoad = () => resolve();
      const onError = () =>
        reject(new Error("Unable to load Cashfree checkout. Please try again."));

      if (!script) {
        script = document.createElement("script");
        script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
        script.async = true;
      }
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (!script.isConnected) document.head.appendChild(script);
    }).catch((error) => {
      cashfreeScriptPromise = null;
      throw error;
    });
  }

  return cashfreeScriptPromise.then(createClient);
}

export default function CashfreeCustomCheckout({
  payment,
  sessionTitle,
  price,
  email,
  phone,
  onBack,
  onPaymentComplete,
  checkoutTitle = "Complete your booking",
  summaryLabel = "BOOKING SUMMARY",
  summaryDescription,
  totalAmount,
  expiryLabel = "Seat hold expires",
  pendingMessage = "Payment is still processing. Your seats remain held while Cashfree confirms it.",
  unconfirmedMessage = "We could not confirm the payment yet. Your seats remain held; please wait and try again.",
}) {
  const [method, setMethod] = useState("upi");
  const [selectedUpiApp, setSelectedUpiApp] = useState(upiApps[0].id);
  const [sdkStatus, setSdkStatus] = useState("loading");
  const [componentsReady, setComponentsReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const cashfreeRef = useRef(null);
  const componentsRef = useRef({});
  const supportsMobileUpiIntent =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    let active = true;
    let createdComponents = [];
    setSdkStatus("loading");
    setComponentsReady(false);
    setPaymentMessage("");
    componentsRef.current = {};

    loadCashfreeSdk(payment.environment)
      .then((cashfree) => {
        if (!active) return;
        cashfreeRef.current = cashfree;
        if (
          method === "upiIntent" &&
          !supportsMobileUpiIntent
        ) {
          setSdkStatus("ready");
          setPaymentMessage(
            "UPI app payments are available on mobile. Choose UPI QR to pay from this device.",
          );
          return;
        }
        const fieldStyle = {
          base: {
            fontSize: "15px",
            fontFamily: '"DM Sans", sans-serif',
            color: "#1c2c25",
            backgroundColor: "#fffdf9",
            border: "1px solid #d8d8ca",
            borderRadius: "5px",
            padding: "14px",
            ":focus": { border: "1px solid #315e44" },
          },
          invalid: { color: "#a0352b" },
        };
        const updateReadiness = () => {
          if (!active) return;
          const current = componentsRef.current;
          if (method === "card") {
            setComponentsReady(
              [
                current.cardNumber,
                current.cardHolder,
                current.cardExpiry,
                current.cardCvv,
              ].every((component) => component?.isComplete()),
            );
          } else if (method === "upi") {
            setComponentsReady(Boolean(current.upiCollect?.isComplete()));
          }
        };
        const makeComponent = (name, options, selector, payable = false) => {
          const component = cashfree.create(name, options);
          component.on("loaderror", (data) => {
            if (!active) return;
            setSdkStatus("error");
            setPaymentMessage(
              data.error?.message ||
                "A secure payment field could not be loaded. Please try again.",
            );
          });
          component.on("ready", () => {
            if (active && payable) setComponentsReady(true);
          });
          component.on("change", updateReadiness);
          componentsRef.current[name] = component;
          createdComponents.push(component);
          component.mount(selector);
          return component;
        };

        if (method === "card") {
          const cardNumber = makeComponent(
            "cardNumber",
            {
              values: { placeholder: "Card number" },
              style: fieldStyle,
            },
            "#class-cashfree-card-number",
          );
          makeComponent(
            "cardHolder",
            {
              values: { placeholder: "Name on card" },
              style: fieldStyle,
            },
            "#class-cashfree-card-holder",
          );
          makeComponent(
            "cardExpiry",
            { style: fieldStyle },
            "#class-cashfree-card-expiry",
          );
          const cardCvv = makeComponent(
            "cardCvv",
            { style: fieldStyle },
            "#class-cashfree-card-cvv",
          );
          cardNumber.on("change", (data) => {
            if (active && data.value?.cvvLength) {
              cardCvv.update({ cvvLength: data.value.cvvLength });
            }
          });
        } else if (method === "upi") {
          makeComponent(
            "upiCollect",
            {
              values: { placeholder: "name@bank" },
              style: fieldStyle,
            },
            "#class-cashfree-upi-id",
          );
        } else if (method === "upiQr") {
          makeComponent(
            "upiQr",
            { values: { size: "220px" } },
            "#class-cashfree-upi-qr",
            true,
          );
        } else if (method === "upiIntent") {
          const app = upiApps.find(({ id }) => id === selectedUpiApp);
          makeComponent(
            "upiApp",
            {
              values: {
                upiApp: app.id,
                buttonText: app.name,
                buttonIcon: true,
              },
            },
            "#class-cashfree-upi-app-button",
            true,
          );
        }
        setSdkStatus("ready");
        updateReadiness();
      })
      .catch((error) => {
        if (!active) return;
        setSdkStatus("error");
        setPaymentMessage(
          error.message || "Cashfree checkout could not be loaded.",
        );
      });

    return () => {
      active = false;
      for (const component of createdComponents) {
        component.unmount();
      }
      componentsRef.current = {};
      cashfreeRef.current = null;
    };
  }, [
    method,
    payment.environment,
    selectedUpiApp,
    supportsMobileUpiIntent,
  ]);

  async function submitPayment() {
    const components = componentsRef.current;
    const componentName = {
      card: "cardNumber",
      upi: "upiCollect",
      upiQr: "upiQr",
      upiIntent: "upiApp",
    }[method];
    const paymentMethod = components[componentName];
    const requiresCompleteInput = method === "card" || method === "upi";
    if (
      !cashfreeRef.current ||
      !paymentMethod ||
      !componentsReady ||
      (requiresCompleteInput && !paymentMethod.isComplete())
    ) {
      setPaymentMessage(
        !cashfreeRef.current
          ? "Secure payment fields are not ready. Please wait and try again."
          : method === "card"
            ? "Complete all card details to continue."
            : method === "upi"
              ? "Enter a valid UPI ID to continue."
              : "The selected payment option is not ready yet. Please wait and try again.",
      );
      return;
    }

    setSubmitting(true);
    setPaymentMessage("");
    try {
      const result = await cashfreeRef.current.pay({
        paymentMethod,
        paymentSessionId: payment.paymentSessionId,
        returnUrl: payment.returnUrl,
        redirect: "if_required",
      });
      if (result?.error) {
        setPaymentMessage(
          result.error.message || "Payment could not be started. Please retry.",
        );
      } else if (result?.paymentDetails) {
        const status = await onPaymentComplete();
        if (status === "pending") {
          setPaymentMessage(pendingMessage);
        } else if (status === "failed" || status === "expired") {
          setPaymentMessage("Cashfree did not confirm the payment. Check the subscription page before trying again.");
        } else if (!status) {
          setPaymentMessage(unconfirmedMessage);
        }
      } else if (result?.redirect) {
        setPaymentMessage(
          "Continue with your payment provider. Your booking status will be checked when you return.",
        );
      } else {
        const status = await onPaymentComplete();
        if (status === "pending") {
          setPaymentMessage(pendingMessage);
        } else if (status === "failed" || status === "expired") {
          setPaymentMessage("Cashfree did not confirm the payment. Check the subscription page before trying again.");
        } else if (!status) {
          setPaymentMessage(unconfirmedMessage);
        }
      }
    } catch (error) {
      setPaymentMessage(
        error.message || "Payment could not be started. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const seatNumbers = payment.seatNumbers || [];
  const total = totalAmount ?? Number(price) * seatNumbers.length;

  return (
    <div className="class-custom-checkout-overlay">
      <section
        className="class-custom-checkout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-custom-checkout-title"
      >
        <header className="class-custom-checkout-header">
          <button
            type="button"
            className="class-custom-checkout-back class-flow-button class-flow-button--gold"
            onClick={onBack}
          >
            <ArrowLeft size={17} /> Back
          </button>
          <div className="class-custom-checkout-heading">
            <span className="eyebrow">SECURE CHECKOUT</span>
            <h2 id="class-custom-checkout-title">{checkoutTitle}</h2>
            <p>Choose UPI or card to continue securely with Cashfree.</p>
          </div>
        </header>

        <div className="class-custom-checkout-content">
          <aside className="class-custom-order-summary">
            <span className="eyebrow">{summaryLabel}</span>
            <h3>{sessionTitle}</h3>
            <p>{summaryDescription || (
              <>
                {seatNumbers.length} seat
                {seatNumbers.length === 1 ? "" : "s"} ·{" "}
                {seatNumbers.join(", ")}
              </>
            )}</p>
            <p className="class-custom-contact">{email} · {phone}</p>
            {payment.expiresAt && (
              <p className="class-custom-hold">
                {expiryLabel}{" "}
                {new Date(payment.expiresAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
            <div className="class-custom-total">
              <span>Total</span>
              <strong>
                {total.toLocaleString("en-IN", {
                  style: "currency",
                  currency: "INR",
                })}
              </strong>
            </div>
          </aside>

          <div className="class-custom-payment">
            <div className="class-custom-methods" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={method === "upi"}
                className={method === "upi" ? "selected" : ""}
                onClick={() => setMethod("upi")}
                disabled={submitting}
              >
                <Smartphone size={18} /> UPI ID
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === "upiQr"}
                className={method === "upiQr" ? "selected" : ""}
                onClick={() => setMethod("upiQr")}
                disabled={submitting}
              >
                <QrCode size={18} /> UPI QR
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === "upiIntent"}
                className={method === "upiIntent" ? "selected" : ""}
                onClick={() => setMethod("upiIntent")}
                disabled={submitting}
              >
                <Smartphone size={18} /> UPI App
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === "card"}
                className={method === "card" ? "selected" : ""}
                onClick={() => setMethod("card")}
                disabled={submitting}
              >
                <CreditCard size={18} /> Card
              </button>
            </div>

            {method === "card" ? (
              <div className="class-custom-card-fields">
                <div id="class-cashfree-card-number" />
                <div id="class-cashfree-card-holder" />
                <div className="class-custom-card-row">
                  <div id="class-cashfree-card-expiry" />
                  <div id="class-cashfree-card-cvv" />
                </div>
              </div>
            ) : method === "upi" ? (
              <div className="class-custom-upi-field">
                <label htmlFor="class-cashfree-upi-id">UPI ID</label>
                <div id="class-cashfree-upi-id" />
                <p>Enter your UPI ID and approve the payment in your UPI app.</p>
              </div>
            ) : method === "upiQr" ? (
              <div className="class-custom-alternative-field">
                <div id="class-cashfree-upi-qr" />
                <p>Scan the QR code with any UPI app to pay.</p>
              </div>
            ) : method === "upiIntent" && !supportsMobileUpiIntent ? (
              null
            ) : method === "upiIntent" ? (
              <div className="class-custom-alternative-field">
                <label htmlFor="class-cashfree-upi-app">Choose a UPI app</label>
                <select
                  id="class-cashfree-upi-app"
                  value={selectedUpiApp}
                  onChange={(event) => setSelectedUpiApp(event.target.value)}
                  disabled={submitting}
                >
                  {upiApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
                <div id="class-cashfree-upi-app-button" />
                <p>Continue on a mobile device to open your selected UPI app.</p>
              </div>
            ) : null}

            {paymentMessage && (
              <p className="class-custom-payment-message" role="alert">
                {paymentMessage}
              </p>
            )}

            <button
              type="button"
              className="btn class-custom-pay class-flow-button class-flow-button--green"
              onClick={submitPayment}
              disabled={
                submitting ||
                sdkStatus !== "ready" ||
                !componentsReady
              }
            >
              {submitting
                ? "Processing securely…"
                : method === "upiIntent"
                  ? `Continue with ${upiApps.find(({ id }) => id === selectedUpiApp).name}`
                  : `Pay ${total.toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                    })}`}
            </button>
            {sdkStatus === "loading" && (
              <p className="class-custom-loading" role="status">
                Loading secure payment fields…
              </p>
            )}
            <p className="class-custom-secure-note">
              <ShieldCheck size={15} /> Payment details are secured by Cashfree.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
