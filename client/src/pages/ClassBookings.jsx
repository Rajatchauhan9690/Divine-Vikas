import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Armchair,
  CalendarDays,
  Clock3,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";

function openCashfreeCheckout(sessionId, environment) {
  return new Promise((resolve, reject) => {
    const start = () => {
      try {
        const cashfree = window.Cashfree({
          mode: environment === "production" ? "production" : "sandbox",
        });
        Promise.resolve(
          cashfree.checkout({
            paymentSessionId: sessionId,
            redirectTarget: "_modal",
          }),
        )
          .then(resolve)
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    };
    if (window.Cashfree) {
      start();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = start;
    script.onerror = () =>
      reject(new Error("Unable to load Cashfree checkout. Please try again."));
    document.head.appendChild(script);
  });
}

export default function ClassBookings() {
  const { user, ready } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [paymentHolds, setPaymentHolds] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSeatNumbers, setSelectedSeatNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busySeat, setBusySeat] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [savedWhatsappOptIn, setSavedWhatsappOptIn] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [searchParams, setSearchParams] = useSearchParams();
  const verifiedReturn = useRef("");

  const loadSessions = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const { data } = await api.get("/classes");
      setSessions(data.sessions || []);
      return true;
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Could not load classes. Please try again.",
      });
      return false;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadPaymentHolds = useCallback(async () => {
    try {
      const { data } = await api.get("/classes/my-payment-holds");
      setPaymentHolds(data.holds || []);
      return true;
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Could not load your active seat payment holds.",
      });
      return false;
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadSessions();
      loadPaymentHolds();
      api
        .get("/profile")
        .then(({ data }) => {
          const optedIn = Boolean(data.profile.whatsappOptIn);
          setWhatsappOptIn(optedIn);
          setSavedWhatsappOptIn(optedIn);
          setProfileLoaded(true);
        })
        .catch((error) =>
          setNotice({
            type: "error",
            message:
              error.response?.data?.message ||
              "Could not load your WhatsApp preference. Refresh before booking.",
          }),
        );
    }
  }, [loadPaymentHolds, loadSessions, user]);

  useEffect(() => {
    const activeSession = sessions.find(
      (session) => session._id === selectedId,
    );
    if (!activeSession) return;
    setSelectedSeatNumbers((current) =>
      current.filter((seatNumber) =>
        activeSession.seats.some(
          (seat) =>
            seat.seatNumber === seatNumber && seat.status === "available",
        ),
      ),
    );
  }, [sessions, selectedId]);

  useEffect(() => {
    const classId = searchParams.get("class_id");
    const seatNumber = searchParams.get("seat");
    const paymentOrderId = searchParams.get("order_id");
    if (
      !user ||
      searchParams.get("payment") !== "return" ||
      !classId ||
      (!seatNumber && !paymentOrderId)
    )
      return;
    const key = `${classId}:${paymentOrderId || seatNumber}`;
    if (verifiedReturn.current === key) return;
    verifiedReturn.current = key;
    setBusySeat(key);
    setSelectedId(classId);
    setSelectedSeatNumbers([]);
    setNotice({ type: "", message: "Checking your payment with Cashfree…" });
    api
      .post(
        paymentOrderId
          ? `/classes/${classId}/payments/${encodeURIComponent(paymentOrderId)}/verify`
          : `/classes/${classId}/seats/${encodeURIComponent(seatNumber)}/verify-payment`,
      )
      .then(async ({ data }) => {
        if (data.paymentStatus === "paid")
          setNotice({
            type: "success",
            message: `Payment confirmed. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} ${data.booking.seatNumbers.length > 1 ? "are" : "is"} booked.`,
          });
        else if (data.paymentStatus === "failed")
          setNotice({
            type: "error",
            message: `Payment was not completed. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} ${data.booking.seatNumbers.length > 1 ? "are" : "is"} available again.`,
          });
        else
          setNotice({
            type: "error",
            message: `Cashfree has not confirmed payment yet. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} ${data.booking.seatNumbers.length > 1 ? "are" : "is"} temporarily held; refresh in a moment.`,
          });
        await Promise.all([
          loadSessions({ quiet: true }),
          loadPaymentHolds(),
        ]);
      })
      .catch((error) =>
        setNotice({
          type: "error",
          message:
            error.response?.data?.message ||
            "Could not verify the payment. Contact support if you were charged.",
        }),
      )
      .finally(() => {
        setBusySeat("");
        setSearchParams({}, { replace: true });
      });
  }, [loadPaymentHolds, loadSessions, searchParams, setSearchParams, user]);

  function toggleSeat(seatNumber) {
    if (selectedSeatNumbers.includes(seatNumber)) {
      setSelectedSeatNumbers((current) =>
        current.filter((selected) => selected !== seatNumber),
      );
      setNotice({ type: "", message: "" });
      return;
    }
    if (selectedSeatNumbers.length >= 3) {
      setNotice({
        type: "error",
        message: "You can book up to 3 seats in one payment.",
      });
      return;
    }
    setSelectedSeatNumbers((current) => [...current, seatNumber]);
    setNotice({ type: "", message: "" });
  }

  async function bookSelectedSeats(session) {
    const seatNumbers = [...selectedSeatNumbers];
    if (!seatNumbers.length) return;
    if (!profileLoaded) {
      setNotice({
        type: "error",
        message:
          "Your WhatsApp preference could not be loaded. Refresh before booking.",
      });
      return;
    }
    setBusySeat("checkout");
    setNotice({ type: "", message: "Preparing secure checkout…" });
    try {
      if (whatsappOptIn !== savedWhatsappOptIn) {
        await api.patch("/profile", { whatsappOptIn });
        setSavedWhatsappOptIn(whatsappOptIn);
      }
      const { data } = await api.post(
        `/classes/${session._id}/seats/payment`,
        { seatNumbers },
      );
      setSelectedSeatNumbers([]);
      setNotice({ type: "", message: "Opening secure checkout…" });
      let checkoutError = null;
      try {
        const checkoutResult = await openCashfreeCheckout(
          data.payment.paymentSessionId,
          data.payment.environment,
        );
        if (checkoutResult?.error) checkoutError = checkoutResult.error;
      } catch (error) {
        checkoutError = error;
      }
      const { data: verification } = await api.post(
        `/classes/${session._id}/payments/${encodeURIComponent(data.payment.paymentOrderId)}/verify`,
      );
      if (verification.paymentStatus === "paid") {
        setNotice({
          type: "success",
          message: `Payment confirmed. Seat${seatNumbers.length > 1 ? "s" : ""} ${seatNumbers.join(", ")} ${seatNumbers.length > 1 ? "are" : "is"} booked.`,
        });
      } else if (verification.paymentStatus === "failed") {
        setNotice({
          type: "error",
          message: "Payment was not completed. The selected seats are available again.",
        });
      } else {
        setNotice({
          type: "error",
          message: checkoutError
            ? "Checkout was closed before payment was confirmed. Your seats are temporarily held, not booked, while Cashfree updates the payment status."
            : "Cashfree has not confirmed the payment yet. Your seats are temporarily held, not booked.",
        });
      }
      await Promise.all([
        loadSessions({ quiet: true }),
        loadPaymentHolds(),
      ]);
      setBusySeat("");
      if (verification.paymentStatus === "pending") {
        const pollId = window.setInterval(() => {
          Promise.all([
            loadSessions({ quiet: true }),
            loadPaymentHolds(),
          ]);
        }, 5000);
        window.setTimeout(() => window.clearInterval(pollId), 60000);
      }
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          error.message ||
          "Could not start payment. Please try again.",
      });
      await Promise.all([
        loadSessions({ quiet: true }),
        loadPaymentHolds(),
      ]);
      setBusySeat("");
    }
  }

  async function resumePayment(hold) {
    setBusySeat(hold.paymentOrderId);
    setNotice({ type: "", message: "Checking your seat hold and payment…" });
    try {
      const { data } = await api.post(
        `/classes/${hold.classId}/payments/${encodeURIComponent(hold.paymentOrderId)}/resume`,
      );
      let finalPaymentStatus = data.paymentStatus;
      if (data.paymentStatus === "paid") {
        setNotice({
          type: "success",
          message: `Payment confirmed. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} ${data.booking.seatNumbers.length > 1 ? "are" : "is"} booked.`,
        });
      } else if (data.paymentStatus === "failed") {
        setNotice({
          type: "error",
          message: `Payment failed. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} ${data.booking.seatNumbers.length > 1 ? "are" : "is"} available again.`,
        });
      } else {
        let checkoutError = null;
        try {
          const checkoutResult = await openCashfreeCheckout(
            data.payment.paymentSessionId,
            data.payment.environment,
          );
          if (checkoutResult?.error) checkoutError = checkoutResult.error;
        } catch (error) {
          checkoutError = error;
        }
        const { data: verification } = await api.post(
          `/classes/${hold.classId}/payments/${encodeURIComponent(hold.paymentOrderId)}/verify`,
        );
        finalPaymentStatus = verification.paymentStatus;
        if (verification.paymentStatus === "paid") {
          setNotice({
            type: "success",
            message: `Payment confirmed. Seat${verification.booking.seatNumbers.length > 1 ? "s" : ""} ${verification.booking.seatNumbers.join(", ")} ${verification.booking.seatNumbers.length > 1 ? "are" : "is"} booked.`,
          });
        } else if (verification.paymentStatus === "failed") {
          setNotice({
            type: "error",
            message: "Payment failed. The held seats are available again.",
          });
        } else {
          setNotice({
            type: "error",
            message: checkoutError
              ? "Checkout was closed before payment was confirmed. Your seats remain held while Cashfree updates the payment status."
              : "Cashfree has not confirmed the payment yet. Your seats remain temporarily held.",
          });
        }
      }
      await Promise.all([
        loadSessions({ quiet: true }),
        loadPaymentHolds(),
      ]);
      if (finalPaymentStatus === "pending") {
        const pollId = window.setInterval(() => {
          Promise.all([
            loadSessions({ quiet: true }),
            loadPaymentHolds(),
          ]);
        }, 5000);
        window.setTimeout(() => window.clearInterval(pollId), 60000);
      }
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Could not resume payment. Refresh your classes and try again.",
      });
      await Promise.all([
        loadSessions({ quiet: true }),
        loadPaymentHolds(),
      ]);
    } finally {
      setBusySeat("");
    }
  }

  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const selectedSession = sessions.find((session) => session._id === selectedId);

  return (
    <section className="section class-booking-page">
      <div className="shop-intro">
        <span className="eyebrow">LEARN TOGETHER</span>
        <h1>
          Book your <em>class seat.</em>
        </h1>
        <p>
          Choose a class, select up to three seats, and pay for them together.
        </p>
      </div>
      {notice.message && (
        <p
          role="status"
          className={`notice ${notice.type === "error" ? "error" : ""}`}
        >
          {notice.message}
        </p>
      )}
      <div className="class-page-actions">
        <p>Welcome {user.name}</p>
        <button
          className="btn btn-outline"
          onClick={() =>
            Promise.all([loadSessions(), loadPaymentHolds()])
          }
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh classes
        </button>
      </div>
      {paymentHolds.length > 0 && (
        <div className="active-seat-holds" aria-label="Active seat payment holds">
          <h2>Payment in progress</h2>
          <p>
            Your seats are held temporarily. Resume payment before the hold
            expires to confirm your booking.
          </p>
          {paymentHolds.map((hold) => (
            <div className="active-seat-hold" key={hold.paymentOrderId}>
              <div>
                <b>{hold.classTitle}</b>
                <span>
                  Seat{hold.seatNumbers.length > 1 ? "s" : ""}{" "}
                  {hold.seatNumbers.join(", ")} · Held until{" "}
                  {new Date(hold.expiresAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-dark"
                disabled={Boolean(busySeat)}
                onClick={() => resumePayment(hold)}
              >
                {busySeat === hold.paymentOrderId
                  ? "Opening payment…"
                  : "Resume payment"}
              </button>
            </div>
          ))}
        </div>
      )}
      {loading ? (
        <div className="loading-state">Loading classes…</div>
      ) : selectedSession ? (
        <div className="class-seat-page">
          <button
            type="button"
            className="class-back-link"
            onClick={() => {
              setSelectedId("");
              setSelectedSeatNumbers([]);
              setNotice({ type: "", message: "" });
            }}
          >
            <ArrowLeft size={17} /> All classes
          </button>
          <article className="class-seat-card">
            <div className="class-seat-summary">
              <span className="eyebrow">CLASS SESSION</span>
              <h2>{selectedSession.title}</h2>
              <p>{selectedSession.description}</p>
              <div className="class-meta">
                <span>
                  <UserRound size={17} /> {selectedSession.instructorName}
                </span>
                <span>
                  <CalendarDays size={17} />
                  {new Date(selectedSession.startsAt).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <span>
                  <Clock3 size={17} />
                  {selectedSession.durationMinutes} minutes
                </span>
              </div>
              {Number(selectedSession.price) > 0 ? (
                <strong className="class-price">
                  ₹{Number(selectedSession.price).toLocaleString("en-IN")}
                  <small> per seat</small>
                </strong>
              ) : (
                <p className="class-price-unavailable">
                  The administrator has not set a price for this session yet.
                </p>
              )}
              <p className="payment-hold-note">
                Select 1–3 seats for one payment. They are held for 20 minutes
                and confirmed only after Cashfree verifies payment.
              </p>
              <p className="payment-hold-note">
                Cashfree uses the phone number saved in your profile.{" "}
                <Link className="text-link" to="/profile">
                  Update phone number
                </Link>{" "}
                if needed.
              </p>
            </div>
            <div className="class-seat-picker">
              <div className="seat-picker-heading">
                <b>
                  <Armchair size={18} /> Choose up to 3 seats
                </b>
                <div className="seat-status-legend">
                  <span className="seat-status-item available-status">
                    <i className="seat-legend available-legend" /> Available
                  </span>
                  <span className="seat-status-item booked-status">
                    <i className="seat-legend booked-legend" /> Booked
                  </span>
                  <span className="seat-status-item held-status">
                    <i className="seat-legend held-legend" /> Held
                  </span>
                </div>
              </div>
              <div className="seat-grid">
                {selectedSession.seats.map((seat) => {
                  const available = seat.status === "available";
                  const selected = selectedSeatNumbers.includes(
                    seat.seatNumber,
                  );
                  const statusLabel =
                    seat.status === "booked"
                      ? "booked"
                      : seat.status === "pending_payment"
                        ? "temporarily held"
                        : "available";
                  const statusClass =
                    seat.status === "booked"
                      ? "booked"
                      : seat.status === "pending_payment"
                        ? "held"
                        : "available";
                  return (
                    <button
                      type="button"
                      key={seat.seatNumber}
                      className={`seat-button ${selected ? "selected" : ""}`}
                      disabled={
                        !available ||
                        !(Number(selectedSession.price) > 0) ||
                        Boolean(busySeat)
                      }
                      aria-pressed={selected}
                      aria-label={`${seat.seatNumber}, ${statusLabel}${selected ? ", selected" : ""}`}
                      onClick={() => toggleSeat(seat.seatNumber)}
                    >
                      <span className={`seat-number-badge ${statusClass}`}>
                        {seat.seatNumber}
                      </span>
                    </button>
                  );
                })}
              </div>
              <label className="whatsapp-opt-in">
                <input
                  type="checkbox"
                  checked={whatsappOptIn}
                  disabled={!profileLoaded || Boolean(busySeat)}
                  onChange={(event) => setWhatsappOptIn(event.target.checked)}
                />
                I agree to receive order and class booking updates on WhatsApp.
                This is optional. Messages are sent only when WhatsApp Business
                messaging is configured.
              </label>
              <div className="seat-checkout">
                <span>
                  {selectedSeatNumbers.length} seat
                  {selectedSeatNumbers.length === 1 ? "" : "s"} selected
                  {selectedSeatNumbers.length > 0 &&
                    ` · Total ₹${(
                      Number(selectedSession.price) *
                      selectedSeatNumbers.length
                    ).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={!selectedSeatNumbers.length || Boolean(busySeat)}
                  onClick={() => bookSelectedSeats(selectedSession)}
                >
                  {busySeat ? "Preparing checkout…" : "Continue to payment"}
                </button>
              </div>
            </div>
          </article>
        </div>
      ) : sessions.length === 0 ? (
        <div className="class-empty">
          <CalendarDays size={30} />
          <h2>No upcoming classes</h2>
          <p>Check back later for new sessions.</p>
        </div>
      ) : (
        <div className="class-session-grid">
          {sessions.map((session) => {
            const available = session.seats.filter(
              (seat) => seat.status === "available",
            ).length;
            return (
              <button
                type="button"
                className="class-session-card"
                key={session._id}
                onClick={() => {
                  setSelectedSeatNumbers([]);
                  setSelectedId(session._id);
                }}
                aria-label={`View seats for ${session.title}`}
              >
                <span className="class-session-top">
                  <span className="eyebrow">CLASS SESSION</span>
                  <span
                    className={available ? "seat-count" : "seat-count full"}
                  >
                    {available ? `${available} seats left` : "Fully booked"}
                  </span>
                </span>
                <span className="class-card-title">{session.title}</span>
                <span className="class-description">
                  {session.description ||
                    "Join this guided class and reserve your place."}
                </span>
                <span className="class-card-meta">
                  <span>
                    <UserRound size={16} /> {session.instructorName}
                  </span>
                  <span>
                    <CalendarDays size={16} />
                    {new Date(session.startsAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </span>
                <span className="class-card-cta">
                  {Number(session.price) > 0
                    ? "View seats and price →"
                    : "View session details →"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!selectedSession && !loading && sessions.length > 0 && (
        <p className="class-page-footer">
          <Link className="text-link" to="/profile">
            Update your phone number
          </Link>{" "}
          if it has changed; Cashfree needs it to process payment.
        </p>
      )}
    </section>
  );
}
