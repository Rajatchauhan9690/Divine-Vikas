import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "../services/api";
import CashfreeCustomCheckout from "./CashfreeCustomCheckout";

function subscriptionTerm(durationMonths = 1) {
  if (durationMonths === 12) return "year";
  if (durationMonths === 3) return "3 months";
  return "month";
}

export default function SubAdminSubscription() {
  const [searchParams] = useSearchParams();
  const [subscription, setSubscription] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get("/sub-admin-subscriptions/me");
    setSubscription(data.subscription);
    return data;
  }, []);

  const verifyRenewal = useCallback(
    async (attemptId) => {
      if (!attemptId) return false;
      setBusy(true);
      setError("");
      try {
        const { data } = await api.post(
          `/sub-admin-subscriptions/renewal/${attemptId}/verify`,
        );
        if (data.status === "paid") {
          setSubscription(data.subscription);
          setCheckout(null);
          setNotice("Your subscription has been renewed.");
          return true;
        }
        setNotice("Cashfree is still confirming your renewal payment.");
        return "pending";
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not verify the renewal payment.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    load()
    .then((data) => {
      if (active && searchParams.get("payment") === "return" && searchParams.get("attempt"))
        verifyRenewal(searchParams.get("attempt"));
      else if (active && data.pendingPayment?.payment?.paymentSessionId)
        setCheckout(data.pendingPayment);
    })
      .catch((requestError) => {
        if (active)
          setError(
            requestError.response?.data?.message ||
              "Could not load subscription details.",
          );
      });
    return () => {
      active = false;
    };
  }, [load, searchParams, verifyRenewal]);

  async function beginRenewal() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/sub-admin-subscriptions/renewal");
      setCheckout(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not start the renewal checkout.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function completePayment() {
    const result = await verifyRenewal(checkout?.attemptId);
    return result;
  }

  if (!subscription && !error)
    return <p className="loading-state">Loading subscription…</p>;

  if (checkout?.payment)
    return (
      <CashfreeCustomCheckout
        payment={checkout.payment}
        sessionTitle={`${subscription.planName} subscription renewal`}
        price={checkout.amount}
        totalAmount={checkout.amount}
        email=""
        phone=""
        checkoutTitle="Renew your subscription"
        summaryLabel={`${subscription.planName} PLAN`}
        summaryDescription={`${subscription.planName} · ₹${checkout.amount} / ${subscriptionTerm(subscription.durationMonths)} · manual renewal`}
        expiryLabel="Checkout expires"
        pendingMessage="Cashfree is confirming the renewal. Your workspace remains available while payment is checked."
        unconfirmedMessage="The payment is not confirmed yet. Check the subscription page again shortly."
        onBack={() => setCheckout(null)}
        onPaymentComplete={completePayment}
      />
    );

  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null;
  return (
    <section className="subscription-management">
      <div className="subscription-management-card">
        <header className="subscription-management-header">
          <div className="subscription-management-kicker">
            <span className="eyebrow">YOUR PLAN</span>
            {subscription?.planName && (
              <span className="subscription-status">
                {subscription.status?.replace("_", " ")}
              </span>
            )}
          </div>
          <h2>{subscription?.planName || "No active plan"}</h2>
        </header>
        {subscription?.planName ? (
          <>
            <p className="subscription-price">
              <strong>₹{subscription.amount}</strong>
              <small> / {subscriptionTerm(subscription.durationMonths)}</small>
            </p>
            <dl className="subscription-capacity">
              <div>
                <dt>Appointment services</dt>
                <dd>Up to {subscription.serviceLimit}</dd>
              </div>
              <div>
                <dt>Bookable time slots</dt>
                <dd>Up to {subscription.sessionLimit || "Legacy plan"}</dd>
              </div>
            </dl>
            <dl className="subscription-management-details">
              <div>
                <dt>Renewal</dt>
                <dd>
                  {subscription.billingMode === "autopay"
                    ? `Automatic (UPI, every ${subscriptionTerm(subscription.durationMonths)})`
                    : "Manual"}
                </dd>
              </div>
              <div>
                <dt>Current period ends</dt>
                <dd>{periodEnd?.toLocaleDateString() || "Not available"}</dd>
              </div>
            </dl>
            <div className="subscription-addons">
              <h3>Need more appointment capacity?</h3>
              <p>
                Add-ons will expire when your current subscription period ends.
                Purchasing will be available soon.
              </p>
              <div className="subscription-addon-actions">
                <button className="btn btn-outline" type="button" disabled>
                  <Plus size={16} /> Add appointment services <span>Coming soon</span>
                </button>
                <button className="btn btn-outline" type="button" disabled>
                  <Plus size={16} /> Add bookable time slots <span>Coming soon</span>
                </button>
                <button className="btn btn-outline" type="button" disabled>
                  <Plus size={16} /> Add both <span>Coming soon</span>
                </button>
              </div>
            </div>
            {subscription.billingMode === "manual" && (
              <button
                className="btn btn-dark"
                onClick={beginRenewal}
                disabled
                title="Subscription renewal is temporarily unavailable."
              >
                Renew for ₹{subscription.amount}
              </button>
            )}
            {subscription.billingMode === "autopay" && (
              <p className="subscription-management-note">
                Your UPI mandate will collect ₹{subscription.amount} automatically every {subscriptionTerm(subscription.durationMonths)}.
              </p>
            )}
          </>
        ) : (
          <p>Choose a subscription plan to manage appointment services.</p>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice success" role="status">{notice}</p>}
      </div>
    </section>
  );
}