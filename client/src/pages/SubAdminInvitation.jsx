import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Flower2 } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import CashfreeCustomCheckout from "../components/CashfreeCustomCheckout";
import PaymentSuccess from "../components/PaymentSuccess";
import Seo from "../components/Seo";

const formatPlanTerm = (durationMonths) =>
  durationMonths === 1
    ? "month"
    : durationMonths === 3
      ? "3 months"
      : "year";

export default function SubAdminInvitation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const attemptId = searchParams.get("attempt") || "";
  const {
    completeSubAdminSubscription,
    cancelSubAdminSubscriptionSignup,
  } = useAuth();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [plans, setPlans] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [planKey, setPlanKey] = useState("");
  const [billingMode, setBillingMode] = useState("manual");
  const [step, setStep] = useState(1);
  const [checkout, setCheckout] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [currentAttemptId, setCurrentAttemptId] = useState("");
  const [confirmPaymentExit, setConfirmPaymentExit] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentSuccessDetails, setPaymentSuccessDetails] = useState([]);
  const selectedPlanRecord = plans.find((plan) => plan.key === planKey);
  const selectedPlan =
    pendingAttempt?.planKey === planKey
      ? {
          ...selectedPlanRecord,
          name: pendingAttempt.planName || selectedPlanRecord?.name,
          amount: pendingAttempt.amount ?? selectedPlanRecord?.amount,
          serviceLimit:
            pendingAttempt.serviceLimit ?? selectedPlanRecord?.serviceLimit,
          sessionLimit:
            pendingAttempt.sessionLimit ?? selectedPlanRecord?.sessionLimit,
          durationMonths:
            pendingAttempt.durationMonths ?? selectedPlanRecord?.durationMonths,
        }
      : selectedPlanRecord;

  const verifyPayment = useCallback(async (id = currentAttemptId || attemptId) => {
    if (!id) return "pending";
    setBusy(true);
    setError("");
    try {
      const status = await completeSubAdminSubscription(id, token);
      if (status === "paid") {
        setPaymentSuccessDetails([
          { label: "Account", value: invitation?.email || "" },
          {
            label: "Subscription",
            value: selectedPlan?.name || "Sub-admin subscription",
          },
          {
            label: "Billing",
            value:
              billingMode === "manual"
                ? "Manual renewal"
                : "Automatic UPI mandate",
          },
          ...(selectedPlan?.durationMonths
            ? [
                {
                  label: "Plan term",
                  value: formatPlanTerm(selectedPlan.durationMonths),
                },
              ]
            : []),
          ...(selectedPlan?.serviceLimit != null
            ? [
                {
                  label: "Appointment services",
                  value: `Up to ${selectedPlan.serviceLimit}`,
                },
              ]
            : []),
          ...(selectedPlan?.sessionLimit != null
            ? [
                {
                  label: "Bookable time slots",
                  value: `Up to ${selectedPlan.sessionLimit}`,
                },
              ]
            : []),
          ...(selectedPlan?.amount != null
            ? [
                {
                  label: "Amount",
                  value: Number(selectedPlan.amount).toLocaleString("en-IN", {
                    style: "currency",
                    currency: "INR",
                  }),
                },
              ]
            : []),
        ]);
        setCheckout(null);
        setCheckoutOpen(false);
        setPaymentSuccess(true);
        return "paid";
      }
      if (status === "failed" || status === "expired") {
        setCurrentAttemptId("");
        setPendingAttempt(null);
        setCheckout(null);
        setSearchParams({ token }, { replace: true });
        setError(
          status === "expired"
            ? "This payment checkout has expired. You can start a new checkout from your invitation."
            : "The payment or mandate authorization was not completed. You can try the checkout again.",
        );
        return status;
      }
      if (status === "refund_required") {
        setError("Cashfree recorded an unexpected or late payment. Contact support before trying again.");
        return status;
      }
      setError("Cashfree is still confirming your payment. Check again in a moment.");
      return "pending";
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not verify the payment yet. Please try again.",
      );
      return "pending";
    } finally {
      setBusy(false);
    }
  }, [
    attemptId,
    completeSubAdminSubscription,
    currentAttemptId,
    billingMode,
    invitation?.email,
    selectedPlan?.name,
    selectedPlan?.amount,
    setSearchParams,
    token,
  ]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/auth/sub-admin-invitation", { params: { token } }),
      api.get("/auth/sub-admin-subscription/plans"),
      api.get("/auth/sub-admin-invitation/attempt", {
        params: { token, ...(attemptId ? { attemptId } : {}) },
      }),
    ])
      .then(([invitationResponse, plansResponse, attemptResponse]) => {
        if (!active) return;
        setInvitation(invitationResponse.data.invitation);
        setName(invitationResponse.data.invitation.name || "");
        setPlans(plansResponse.data.plans);
        const signupAttempt = attemptResponse.data.attempt;
        if (signupAttempt) {
          setName(signupAttempt.name || invitationResponse.data.invitation.name || "");
          setPhone(signupAttempt.phone || "");
          setPlanKey(signupAttempt.planKey);
          setBillingMode(signupAttempt.billingMode);
          setCurrentAttemptId(
            signupAttempt.status === "pending" ? signupAttempt._id : "",
          );
          setPendingAttempt(
            signupAttempt.status === "pending" ? signupAttempt : null,
          );
          setStep(3);
          if (
            signupAttempt.status === "pending" &&
            signupAttempt.billingMode === "manual" &&
            signupAttempt.paymentSessionId
          ) {
            setCheckout({
              attemptId: signupAttempt._id,
              billingMode: "manual",
              amount: signupAttempt.amount,
              payment: {
                provider: "cashfree",
                paymentSessionId: signupAttempt.paymentSessionId,
                environment: signupAttempt.environment,
                expiresAt: signupAttempt.expiresAt,
                returnUrl: signupAttempt.returnUrl,
              },
            });
          }
          if (signupAttempt.status !== "pending")
            setError(
              "Your previous checkout is no longer active. You can start a new checkout.",
            );
        } else {
          setPlanKey(plansResponse.data.plans[0]?.key || "");
        }
        if (!plansResponse.data.plans.length)
          setError("Subscription plans are temporarily unavailable.");
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError.response?.data?.message ||
              "This invitation is invalid or has expired.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, attemptId]);

  useEffect(() => {
    if (!loading && attemptId && searchParams.get("payment") === "return")
      verifyPayment();
  }, [attemptId, loading, searchParams, verifyPayment]);

  useEffect(() => {
    if (!confirmPaymentExit) return;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) setConfirmPaymentExit(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmPaymentExit, busy]);

  useEffect(() => {
    document.body.classList.toggle("cashfree-checkout-active", checkoutOpen);
    if (checkoutOpen) window.scrollTo(0, 0);
    return () => document.body.classList.remove("cashfree-checkout-active");
  }, [checkoutOpen]);

  async function exitPayment() {
    const id = checkout?.attemptId || currentAttemptId || attemptId;
    if (!id) {
      setConfirmPaymentExit(false);
      setCheckout(null);
      setCheckoutOpen(false);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const status = await cancelSubAdminSubscriptionSignup(id, token);
      if (status === "paid") {
        setConfirmPaymentExit(false);
        setCheckout(null);
        setCheckoutOpen(false);
        setPaymentSuccess(true);
        return;
      }
      if (status === "refund_required") {
        setError(
          "Cashfree recorded a payment that needs support. The checkout has not been closed.",
        );
        return;
      }
      if (status === "pending") {
        setError(
          "Cashfree is still confirming this payment. Please check the payment status before exiting.",
        );
        return;
      }

      setConfirmPaymentExit(false);
      setCheckout(null);
      setCheckoutOpen(false);
      setCurrentAttemptId("");
      setPendingAttempt(null);
      setSearchParams({ token }, { replace: true });
      setError(
        "Payment checkout closed. You can start a new payment from the review step.",
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not close the payment checkout. Your payment status is unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (step === 1) {
      if (name.trim().length < 2 || !/^\+?[1-9]\d{9,14}$/.test(phone.replace(/[\s()-]/g, ""))) {
        setError("Enter your name and a valid phone number to continue.");
        return;
      }
      if (password.length < 8) {
        setError("Choose a password with at least 8 characters.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!planKey) {
        setError("Choose an available subscription plan.");
        return;
      }
      setStep(3);
      return;
    }
    if (checkout?.payment) {
      setCheckoutOpen(true);
      return;
    }
    if (
      billingMode === "autopay" &&
      pendingAttempt?.status === "pending" &&
      pendingAttempt.paymentUrl
    ) {
      window.location.assign(pendingAttempt.paymentUrl);
      return;
    }
    if (currentAttemptId) {
      await verifyPayment(currentAttemptId);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/sub-admin-invitation/checkout", {
        token,
        name,
        phone,
        password,
        planKey,
        billingMode,
      });
      if (data.planKey) {
        setName(data.name || name);
        setPhone(data.phone || phone);
        setPlanKey(data.planKey);
        setBillingMode(data.billingMode);
        setPendingAttempt({ ...data, status: "pending" });
      }
      if (data.billingMode === "autopay") {
        setCurrentAttemptId(data.attemptId);
        setPendingAttempt({
          ...data,
          name,
          phone,
          planKey,
          planName: selectedPlan?.name,
          amount: selectedPlan?.amount,
          serviceLimit: selectedPlan?.serviceLimit,
          sessionLimit: selectedPlan?.sessionLimit,
          durationMonths: selectedPlan?.durationMonths,
          status: "pending",
        });
        setSearchParams(
          { token, attempt: data.attemptId, payment: "return" },
          { replace: true },
        );
        window.location.assign(data.paymentUrl);
        return;
      }
      if (!data.payment?.paymentSessionId)
        throw new Error("Cashfree did not return a payment session. Please try again.");
      setCheckout(data);
      setCurrentAttemptId(data.attemptId);
      setCheckoutOpen(true);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not start the subscription checkout.",
      );
    } finally {
      setBusy(false);
    }
  }

  const paymentExitConfirmation = confirmPaymentExit && createPortal(
    <div
      className="class-exit-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy)
          setConfirmPaymentExit(false);
      }}
    >
      <section
        className="class-exit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sub-admin-payment-exit-title"
        aria-describedby="sub-admin-payment-exit-description"
      >
        <div className="class-exit-icon" aria-hidden="true">
          <ArrowLeft size={22} />
        </div>
        <span className="eyebrow">SECURE PAYMENT</span>
        <h2 id="sub-admin-payment-exit-title">Leave checkout?</h2>
        <p id="sub-admin-payment-exit-description">
          Exiting cancels this payment attempt and removes its checkout. You can
          start a new payment from the review step.
        </p>
        {error && <p className="class-exit-error" role="alert">{error}</p>}
        <div className="class-exit-actions">
          <button
            type="button"
            className="btn class-flow-button class-flow-button--green"
            disabled={busy}
            onClick={() => {
              setConfirmPaymentExit(false);
            }}
          >
            Continue payment
          </button>
          <button
            type="button"
            className="btn class-flow-button class-flow-button--danger"
            disabled={busy}
            onClick={exitPayment}
          >
            {busy ? "Closing payment…" : "Exit payment"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );

  return (
    <>
    {paymentSuccess && (
      <PaymentSuccess
        title="Your subscription is active"
        message="Your payment was received and your sub-admin registration is complete."
        details={paymentSuccessDetails}
        returnTo="your admin services"
        onClose={() => {
          setPaymentSuccess(false);
          navigate("/admin/services", { replace: true });
        }}
      />
    )}
    {paymentExitConfirmation}
    <div className="sub-admin-invitation-page">
      <Seo
        title="Sub-admin Invitation"
        description="Complete your private Divine Vikas sub-admin account and subscription setup."
        robots="noindex, nofollow"
      />
    <div
      className={`auth-form-wrap sub-admin-invitation-card${step === 3 ? " is-subscription-review" : ""}`}
    >
      <div className="auth-topbar">
        <div className="auth-brand"><Flower2 /><span>DIVINE VIKAS</span></div>
        <Link to="/" className="auth-home-link"><ArrowLeft size={15} /> Back to home</Link>
      </div>
      <span className="eyebrow">SUB-ADMIN INVITATION</span>
      <h1>Set up your subscription.</h1>
      <p>Accept your invitation, choose a plan and activate your workspace.</p>
      {loading ? (
        <p className="loading-state">Checking your invitation…</p>
      ) : !invitation ? (
        <p className="notice error" role="alert">{error}</p>
      ) : checkout?.payment && checkoutOpen ? createPortal(
        <CashfreeCustomCheckout
          payment={checkout.payment}
          sessionTitle={`${selectedPlan?.name || "Sub-admin"} subscription`}
          price={checkout.amount}
          totalAmount={checkout.amount}
          email={invitation.email}
          phone={phone}
          checkoutTitle="Activate your subscription"
          summaryLabel={`${selectedPlan?.name || "SUBSCRIPTION"} PLAN`}
          summaryDescription={`${selectedPlan?.name} · ₹${checkout.amount} / ${formatPlanTerm(selectedPlan?.durationMonths || 1)} · ${billingMode === "manual" ? "manual renewal" : "automatic renewal"}`}
          expiryLabel="Checkout expires"
          pendingMessage="Cashfree is confirming the payment. Your account will activate as soon as payment is verified."
          unconfirmedMessage="Payment is not confirmed yet. Your account remains inactive until Cashfree confirms it."
          onPaymentComplete={() => verifyPayment(checkout.attemptId)}
          onBack={() => setConfirmPaymentExit(true)}
        />,
        document.body,
      ) : (
        <>
          <form className="form-stack" onSubmit={submit}>
            {step === 1 && (
              <>
                <label>
                  Email address
                  <input value={invitation.email} readOnly type="email" />
                </label>
                <label>
                  Full name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength="2"
                    maxLength="80"
                    autoComplete="name"
                    required
                  />
                </label>
                <label>
                  Phone number
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    type="tel"
                    autoComplete="tel"
                    minLength="10"
                    maxLength="16"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength="8"
                    maxLength="72"
                    autoComplete="new-password"
                    required
                  />
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <fieldset className="subscription-plan-list subscription-period-options">
                  {plans.map((plan) => (
                    <label
                      className={`subscription-plan-option subscription-period-option${planKey === plan.key ? " selected" : ""}`}
                      key={plan.key}
                    >
                      <span className="subscription-period-title">
                        <input
                          type="radio"
                          name="plan"
                          value={plan.key}
                          checked={planKey === plan.key}
                          onChange={() => setPlanKey(plan.key)}
                        />
                        <strong>{plan.name}</strong>
                      </span>
                      <b>
                        ₹{plan.amount}
                        <small>/{formatPlanTerm(plan.durationMonths)}</small>
                      </b>
                      <small className="subscription-period-description">
                        {plan.description}
                      </small>
                      <small className="subscription-period-limits">
                        {plan.serviceLimit} services · {plan.sessionLimit} slots
                      </small>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="subscription-plan-list subscription-renewal-options">
                  <legend>Choose how to renew</legend>
                  <label
                    className={`subscription-plan-option${billingMode === "manual" ? " selected" : ""}`}
                    data-tooltip="Pay through Cashfree at the end of each plan period. No recurring mandate is created."
                  >
                    <input
                      type="radio"
                      name="billingMode"
                      checked={billingMode === "manual"}
                      onChange={() => setBillingMode("manual")}
                    />
                    <span>
                      <strong>
                        Manual renewal
                      </strong>
                      <small>Pay each plan period</small>
                    </span>
                  </label>
                  <label
                    className={`subscription-plan-option${billingMode === "autopay" ? " selected" : ""}`}
                    data-tooltip={`Approve a UPI mandate through Cashfree. ₹${selectedPlan?.amount || 0} is charged automatically every ${formatPlanTerm(selectedPlan?.durationMonths || 1)}.`}
                  >
                    <input
                      type="radio"
                      name="billingMode"
                      checked={billingMode === "autopay"}
                      onChange={() => setBillingMode("autopay")}
                    />
                    <span>
                      <strong>
                        Automatic renewal
                      </strong>
                      <small>Automatic UPI mandate</small>
                    </span>
                  </label>
                </fieldset>
              </>
            )}
            {step === 3 && (
              <div className="subscription-review">
                <div className="subscription-review-heading">
                  <span className="eyebrow">FINAL REVIEW</span>
                  <h2>Your subscription</h2>
                </div>
                <div className="subscription-review-grid">
                  <p>
                    <span>Account</span>
                    <strong>{invitation.email}</strong>
                  </p>
                  <p>
                    <span>Billing period</span>
                    <strong>
                      {selectedPlan?.name} ·{" "}
                      {formatPlanTerm(selectedPlan?.durationMonths || 1)}
                    </strong>
                  </p>
                  <p className="subscription-review-total">
                    <span>Due today</span>
                    <strong>₹{selectedPlan?.amount}</strong>
                  </p>
                  <p>
                    <span>Appointment services</span>
                    <strong>Up to {selectedPlan?.serviceLimit}</strong>
                  </p>
                  <p>
                    <span>Bookable time slots</span>
                    <strong>Up to {selectedPlan?.sessionLimit}</strong>
                  </p>
                  <p>
                    <span>Renewal method</span>
                    <strong>
                      {billingMode === "manual"
                        ? "Manual payment"
                        : "Automatic UPI mandate"}
                    </strong>
                  </p>
                </div>
                <div className="subscription-review-note">
                  {billingMode === "manual"
                    ? `Renew through Cashfree every ${formatPlanTerm(selectedPlan?.durationMonths || 1)}. Your account activates after today's payment is verified.`
                    : `Approve the UPI mandate. ₹${selectedPlan?.amount} is charged every ${formatPlanTerm(selectedPlan?.durationMonths || 1)}. A refundable ₹1 authorization may be requested. Your account activates after the first payment is verified.`}
                </div>
              </div>
            )}
            {error && <p className="notice error" role="alert">{error}</p>}
            <div className="subscription-step-actions">
              {step > 1 && (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setStep(step - 1)}
                  disabled={busy || Boolean(currentAttemptId || attemptId)}
                >
                  Back
                </button>
              )}
              <button className="btn btn-dark btn-full" disabled={busy}>
                {busy
                  ? "Starting secure checkout…"
                  : step < 3
                    ? "Continue"
                    : checkout
                      ? "Continue to payment"
                      : billingMode === "manual"
                        ? "Continue to payment"
                        : "Set up automatic payment"}
              </button>
            </div>
            {(attemptId || currentAttemptId) && (
              <button className="btn btn-outline btn-full" type="button" onClick={verifyPayment} disabled={busy}>
                {busy ? "Checking payment…" : "Check payment status"}
              </button>
            )}
          </form>
        </>
      )}
    </div>
    </div>
    </>
  );
}
