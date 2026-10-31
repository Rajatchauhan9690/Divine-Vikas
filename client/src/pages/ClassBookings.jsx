import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Armchair,
  CalendarDays,
  Clock3,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import AdminToast from "../components/AdminToast";
import ClassCashfreeCheckout from "../components/ClassCashfreeCheckout";

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

function formatRetryCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

const CUSTOM_CHECKOUT_STORAGE_KEY = "class-custom-checkout";

export default function ClassBookings() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [paymentHolds, setPaymentHolds] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSeatNumbers, setSelectedSeatNumbers] = useState([]);
  const [pendingClassPayment, setPendingClassPayment] = useState(null);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState("hosted");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [exitFromCheckout, setExitFromCheckout] = useState(false);
  const [bookingStep, setBookingStep] = useState("seats");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [loading, setLoading] = useState(true);
  const [busySeat, setBusySeat] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [savedWhatsappOptIn, setSavedWhatsappOptIn] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [toast, setToast] = useState(null);
  const [classPaymentRetryAt, setClassPaymentRetryAt] = useState(0);
  const [classPaymentRetrySeconds, setClassPaymentRetrySeconds] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const verifiedReturn = useRef("");
  const checkoutFlowRef = useRef(0);
  const exitPromptRef = useRef(null);
  const paymentPageReturnRestored = useRef(false);
  const paymentPageReturnData = useRef(null);
  const customCheckoutRestoreAttempted = useRef(false);

  useEffect(() => {
    if (!notice.type || !notice.message) {
      setToast(null);
      return;
    }
    setToast({ type: notice.type, text: notice.message });
  }, [notice]);

  useEffect(() => {
    if (!classPaymentRetryAt) return undefined;
    const updateCountdown = () => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((classPaymentRetryAt - Date.now()) / 1000),
      );
      setClassPaymentRetrySeconds(secondsLeft);
      if (secondsLeft === 0) setClassPaymentRetryAt(0);
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [classPaymentRetryAt]);

  useEffect(() => {
    if (!showExitConfirm) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowExitConfirm(false);
        setExitFromCheckout(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showExitConfirm]);

  useEffect(() => {
    document.body.classList.toggle("cashfree-checkout-active", checkoutActive);
    return () => document.body.classList.remove("cashfree-checkout-active");
  }, [checkoutActive]);

  useEffect(() => {
    const exitPrompt = exitPromptRef.current;
    if (!showExitConfirm || !exitPrompt) return undefined;
    if (!exitPrompt.showPopover) {
      exitPrompt.removeAttribute("popover");
      return undefined;
    }
    exitPrompt.showPopover();
    return () => {
      if (exitPrompt.matches(":popover-open")) exitPrompt.hidePopover();
    };
  }, [showExitConfirm]);

  useEffect(() => {
    if (checkoutActive) window.scrollTo(0, 0);
  }, [checkoutActive]);

  const loadSessions = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const { data } = await api.get("/classes");
      setSessions(data.sessions || []);
      setSessionsLoaded(true);
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
          const profile = data.profile;
          const optedIn = Boolean(profile.whatsappOptIn);
          const paymentReturn = paymentPageReturnData.current;
          const savedPhone =
            profile.addresses?.find((address) => address.isDefault)?.phone ||
            profile.addresses?.[0]?.phone;
          setContactEmail(
            paymentReturn?.email || profile.email || user.email || "",
          );
          setContactPhone(
            paymentReturn?.phone || profile.phone || savedPhone || "",
          );
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
    if (!sessionsLoaded || paymentPageReturnRestored.current) return;
    paymentPageReturnRestored.current = true;
    const savedReturn = sessionStorage.getItem("class-payment-page-return");
    if (!savedReturn) return;
    sessionStorage.removeItem("class-payment-page-return");

    let restored;
    try {
      restored = JSON.parse(savedReturn);
    } catch {
      setNotice({
        type: "error",
        message:
          "Could not restore the booking page. Please select your seats again.",
      });
      return;
    }
    paymentPageReturnData.current = restored;

    const session = sessions.find((item) => item._id === restored.classId);
    if (!session) {
      setNotice({
        type: "error",
        message:
          "The class session is no longer available. Please choose another session.",
      });
      return;
    }

    setSelectedId(session._id);
    setContactEmail(restored.email || "");
    setContactPhone(restored.phone || "");
    if (restored.paymentStatus === "paid") {
      setSelectedSeatNumbers([]);
      setBookingStep("seats");
      setNotice({
        type: "success",
        message: `Payment confirmed. Seat${restored.seatNumbers.length > 1 ? "s" : ""} ${restored.seatNumbers.join(", ")} ${restored.seatNumbers.length > 1 ? "are" : "is"} booked.`,
      });
      return;
    }

    const availableSeats = restored.seatNumbers.filter((seatNumber) =>
      session.seats.some(
        (seat) => seat.seatNumber === seatNumber && seat.status === "available",
      ),
    );
    setSelectedSeatNumbers(availableSeats);
    setBookingStep(availableSeats.length ? "payment" : "seats");
    setNotice({
      type:
        availableSeats.length === restored.seatNumbers.length ? "" : "error",
      message:
        availableSeats.length === restored.seatNumbers.length
          ? ""
          : "Some seats are no longer available. Please select available seats again.",
    });
  }, [sessionsLoaded, sessions]);

  useEffect(() => {
    if (
      !user ||
      !sessionsLoaded ||
      customCheckoutRestoreAttempted.current ||
      searchParams.get("payment") === "return"
    )
      return;

    let savedCheckout;
    try {
      savedCheckout = sessionStorage.getItem(CUSTOM_CHECKOUT_STORAGE_KEY);
    } catch (error) {
      customCheckoutRestoreAttempted.current = true;
      setNotice({
        type: "error",
        message:
          error.message || "Could not read your saved checkout information.",
      });
      return;
    }
    if (!savedCheckout) {
      customCheckoutRestoreAttempted.current = true;
      return;
    }

    let restored;
    try {
      restored = JSON.parse(savedCheckout);
    } catch {
      sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
      customCheckoutRestoreAttempted.current = true;
      setNotice({
        type: "error",
        message:
          "Could not restore your checkout. Please select your seats again.",
      });
      return;
    }

    if (!restored || typeof restored !== "object") {
      sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
      customCheckoutRestoreAttempted.current = true;
      setNotice({
        type: "error",
        message:
          "Could not restore your checkout. Please select your seats again.",
      });
      return;
    }

    if (restored.userId !== user.id) {
      sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
      customCheckoutRestoreAttempted.current = true;
      return;
    }

    const session = sessions.find(
      (item) => item._id === restored.classId,
    );
    if (
      !session ||
      typeof restored.classId !== "string" ||
      typeof restored.paymentOrderId !== "string" ||
      !Array.isArray(restored.seatNumbers) ||
      !restored.seatNumbers.length ||
      restored.seatNumbers.length > 3 ||
      !restored.seatNumbers.every(
        (seatNumber) => typeof seatNumber === "string",
      )
    ) {
      sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
      customCheckoutRestoreAttempted.current = true;
      setNotice({
        type: "error",
        message:
          "Could not restore your checkout. Please select your seats again.",
      });
      return;
    }

    customCheckoutRestoreAttempted.current = true;
    setSelectedId(session._id);
    setSelectedSeatNumbers(restored.seatNumbers);
    setContactEmail(restored.email || user.email || "");
    setContactPhone(restored.phone || "");
    setPendingClassPayment({
      classId: restored.classId,
      paymentOrderId: restored.paymentOrderId,
      seatNumbers: restored.seatNumbers,
      expiresAt: restored.expiresAt,
    });
    setBookingStep("payment");
    setCheckoutMode("custom");
    setBusySeat("resume");
    setNotice({ type: "", message: "Checking your payment status…" });

    api
      .post(
        `/classes/${restored.classId}/payments/${encodeURIComponent(restored.paymentOrderId)}/resume`,
      )
      .then(async ({ data }) => {
        if (data.paymentStatus === "pending" && data.payment) {
          setPendingClassPayment({
            classId: restored.classId,
            paymentOrderId: restored.paymentOrderId,
            paymentSessionId: data.payment.paymentSessionId,
            environment: data.payment.environment,
            seatNumbers: restored.seatNumbers,
            expiresAt: data.payment.expiresAt,
            returnUrl: data.payment.returnUrl,
          });
          setCheckoutActive(true);
          setNotice({ type: "", message: "" });
          return;
        }

        sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
        setPendingClassPayment(null);
        setSelectedSeatNumbers([]);
        setBookingStep("seats");
        const paymentSucceeded = data.paymentStatus === "paid";
        const paymentFailed = data.paymentStatus === "failed";
        setNotice({
          type: paymentSucceeded ? "success" : "error",
          message:
            paymentSucceeded
              ? `Payment confirmed. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} ${data.booking.seatNumbers.length > 1 ? "are" : "is"} booked.`
              : paymentFailed
                ? `Cashfree reports this payment attempt failed. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} have been released. Select available seats to try again.`
                : "This checkout is no longer active. Check My bookings before starting another payment.",
        });
        await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
      })
      .catch(async (error) => {
        const inactivePayment =
          error.response?.status === 404 ||
          error.response?.data?.code === "NO_ACTIVE_PAYMENT";
        if (inactivePayment) {
          sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
        }
        setPendingClassPayment(null);
        setBookingStep(inactivePayment ? "seats" : "details");
        setNotice({
          type: "error",
          message: inactivePayment
            ? "The seat hold expired or was released before Cashfree confirmed payment. Check My bookings before selecting seats again."
            : error.response?.data?.message ||
                "Could not restore your checkout. Choose Custom checkout to try again.",
        });
        if (inactivePayment)
          await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
      })
      .finally(() => setBusySeat(""));
  }, [
    loadPaymentHolds,
    loadSessions,
    searchParams,
    sessions,
    sessionsLoaded,
    user,
  ]);

  useEffect(() => {
    const activeSession = sessions.find(
      (session) => session._id === selectedId,
    );
    if (!activeSession) return;
    setSelectedSeatNumbers((current) =>
      current.filter((seatNumber) =>
        pendingClassPayment?.classId === activeSession._id &&
        pendingClassPayment.seatNumbers.includes(seatNumber)
          ? true
          : activeSession.seats.some(
              (seat) =>
                seat.seatNumber === seatNumber && seat.status === "available",
            ),
      ),
    );
  }, [pendingClassPayment, sessions, selectedId]);

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
    setBookingStep("seats");
    setNotice({ type: "", message: "Checking your payment with Cashfree…" });
    api
      .post(
        paymentOrderId
          ? `/classes/${classId}/payments/${encodeURIComponent(paymentOrderId)}/verify`
          : `/classes/${classId}/seats/${encodeURIComponent(seatNumber)}/verify-payment`,
      )
      .then(async ({ data }) => {
        if (
          data.paymentStatus === "paid" ||
          data.paymentStatus === "failed"
        )
          sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
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
        await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
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
      setToast({
        type: "error",
        text: "You can select a maximum of 3 seats per booking.",
      });
      return;
    }
    setSelectedSeatNumbers((current) => [...current, seatNumber]);
    setNotice({ type: "", message: "" });
  }

  function validateContactDetails() {
    const email = contactEmail.trim().toLowerCase();
    const phoneInput = contactPhone.trim();
    const phone = phoneInput.replace(/\D/g, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      setNotice({ type: "error", message: "Enter a valid email address." });
      document.getElementById("class-contact-email")?.focus();
      return false;
    }
    if (
      !/^\+?[0-9 ().-]{8,20}$/.test(phoneInput) ||
      phone.length < 10 ||
      phone.length > 15
    ) {
      setNotice({
        type: "error",
        message: "Enter a valid mobile number with 10 to 15 digits.",
      });
      document.getElementById("class-contact-phone")?.focus();
      return false;
    }
    return true;
  }

  async function prepareClassPayment(session, mode = "hosted") {
    const seatNumbers = [...selectedSeatNumbers];
    if (!seatNumbers.length || classPaymentRetrySeconds > 0) return;
    const email = contactEmail.trim().toLowerCase();
    const phoneInput = contactPhone.trim();
    const phone = phoneInput.replace(/\D/g, "");
    if (!validateContactDetails()) return;
    setBusySeat("checkout");
    setNotice({ type: "", message: "Checking seat availability…" });
    let paymentToLaunch = null;
    try {
      if (profileLoaded && whatsappOptIn !== savedWhatsappOptIn) {
        await api.patch("/profile", { whatsappOptIn });
        setSavedWhatsappOptIn(whatsappOptIn);
      }
      const { data } = await api.post(`/classes/${session._id}/seats/payment`, {
        seatNumbers,
        email,
        phone,
      });
      paymentToLaunch = {
        classId: session._id,
        paymentOrderId: data.payment.paymentOrderId,
        paymentSessionId: data.payment.paymentSessionId,
        environment: data.payment.environment,
        seatNumbers: data.payment.seatNumbers || seatNumbers,
        expiresAt: data.payment.expiresAt,
        returnUrl: data.payment.returnUrl,
      };
      setPendingClassPayment(paymentToLaunch);
      setNotice({ type: "", message: "" });
      await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
    } catch (error) {
      const retryAfterSeconds = Number(
        error.response?.headers?.["retry-after"],
      );
      if (
        error.response?.data?.code === "CLASS_BOOKING_RATE_LIMITED" &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds > 0
      ) {
        setClassPaymentRetryAt(Date.now() + retryAfterSeconds * 1000);
        setClassPaymentRetrySeconds(retryAfterSeconds);
      }
      setNotice({
        type: "error",
        message:
          error.response?.data?.code === "CLASS_BOOKING_RATE_LIMITED"
            ? "Too many class payment attempts. Try again after 15 min."
            : error.response?.data?.message ||
              error.message ||
              "Could not prepare payment. Please try again.",
      });
      await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
    } finally {
      if (!paymentToLaunch) setBusySeat("");
    }
    if (paymentToLaunch) await launchCashfreeCheckout(paymentToLaunch, mode);
  }

  async function launchCashfreeCheckout(payment, mode = "hosted") {
    const flowId = ++checkoutFlowRef.current;
    if (mode === "custom") {
      try {
        sessionStorage.setItem(
          CUSTOM_CHECKOUT_STORAGE_KEY,
          JSON.stringify({
            userId: user.id,
            classId: payment.classId,
            paymentOrderId: payment.paymentOrderId,
            seatNumbers: payment.seatNumbers,
            expiresAt: payment.expiresAt,
            email: contactEmail.trim().toLowerCase(),
            phone: contactPhone.trim(),
          }),
        );
      } catch (error) {
        setNotice({
          type: "error",
          message:
            error.message ||
            "Could not save your checkout for recovery after a refresh.",
        });
        return;
      }
    }
    setCheckoutMode(mode);
    setCheckoutActive(true);
    if (mode === "custom") {
      setBusySeat("");
      setNotice({ type: "", message: "" });
      return;
    }
    setBusySeat("checkout");
    setNotice({ type: "", message: "Opening secure checkout…" });
    let checkoutResult;
    try {
      const checkoutPromise = openCashfreeCheckout(
        payment.paymentSessionId,
        payment.environment,
      );
      setCheckoutActive(false);
      setBusySeat("");
      setNotice({
        type: "",
        message:
          "Cashfree checkout is open. If you close it, you can resume payment while your seat hold is active.",
      });
      checkoutResult = await checkoutPromise;
    } catch (error) {
      if (flowId !== checkoutFlowRef.current) return;
      setCheckoutActive(false);
      setNotice({
        type: "error",
        message:
          error.message ||
          "Could not open Cashfree checkout. Please try again.",
      });
      setBusySeat("");
      return;
    }
    if (flowId !== checkoutFlowRef.current) return;
    if (checkoutResult?.error && !checkoutResult.paymentDetails) {
      setCheckoutActive(false);
      await confirmPaymentExit();
      return;
    }
    setCheckoutActive(false);
    await verifyPendingClassPayment(payment);
  }

  async function verifyPendingClassPayment(payment) {
    const { classId, paymentOrderId, seatNumbers } = payment;
    try {
      const { data: verification } = await api.post(
        `/classes/${classId}/payments/${encodeURIComponent(paymentOrderId)}/verify`,
      );
      if (verification.paymentStatus === "paid") {
        sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
        setCheckoutActive(false);
        setPendingClassPayment(null);
        setSelectedSeatNumbers([]);
        setBookingStep("seats");
        setNotice({
          type: "success",
          message: `Payment confirmed. Seat${seatNumbers.length > 1 ? "s" : ""} ${seatNumbers.join(", ")} ${seatNumbers.length > 1 ? "are" : "is"} booked.`,
        });
      } else if (verification.paymentStatus === "failed") {
        sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
        setCheckoutActive(false);
        setPendingClassPayment(null);
        setSelectedSeatNumbers([]);
        setBookingStep("seats");
        setNotice({
          type: "error",
          message:
            "Payment was not completed. The selected seats are available again.",
        });
      } else {
        setNotice({
          type: "error",
          message:
            "Cashfree has not confirmed the payment yet. Your seats are temporarily held, not booked.",
        });
      }
      await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
      setBusySeat("");
      if (verification.paymentStatus === "pending") {
        const pollId = window.setInterval(() => {
          Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
        }, 5000);
        window.setTimeout(() => window.clearInterval(pollId), 60000);
      }
      return verification.paymentStatus;
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          error.message ||
          "Could not verify payment. Your seats remain temporarily held.",
      });
      await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
      setBusySeat("");
      return null;
    }
  }

  function continueToCashfree(mode = "hosted") {
    if (pendingClassPayment)
      void launchCashfreeCheckout(pendingClassPayment, mode);
  }

  function requestPaymentExit() {
    setExitFromCheckout(checkoutActive);
    setNotice({ type: "", message: "" });
    setShowExitConfirm(true);
  }

  function continuePaymentAfterPrompt() {
    setShowExitConfirm(false);
    setExitFromCheckout(false);
  }

  async function confirmPaymentExit() {
    const paymentStatus = await cancelPendingClassPayment();
    if (!paymentStatus) return;
    if (checkoutMode === "custom") {
      setShowExitConfirm(false);
      setExitFromCheckout(false);
      setCheckoutActive(false);
      if (paymentStatus === "cancelled") {
        setBookingStep("payment");
        setNotice({
          type: "",
          message: "Seat hold released. Select Make payment to continue.",
        });
      }
      await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
      return;
    }
    try {
      sessionStorage.setItem(
        "class-payment-page-return",
        JSON.stringify({
          classId: pendingClassPayment.classId,
          seatNumbers: pendingClassPayment.seatNumbers,
          email: contactEmail,
          phone: contactPhone,
          paymentStatus,
        }),
      );
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.message ||
          "Could not safely return to the payment page. Please close Cashfree and try again.",
      });
      return;
    }
    window.location.reload();
  }

  async function cancelPendingClassPayment() {
    if (!pendingClassPayment) return null;
    const { classId, paymentOrderId } = pendingClassPayment;
    setBusySeat("cancel");
    setNotice({ type: "", message: "Cancelling payment and releasing seats…" });
    try {
      const { data } = await api.post(
        `/classes/${classId}/payments/${encodeURIComponent(paymentOrderId)}/cancel`,
      );
      if (data.paymentStatus === "paid") {
        sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
        setPendingClassPayment(null);
        setSelectedSeatNumbers([]);
        setBookingStep("seats");
        setNotice({
          type: "success",
          message: `Payment was confirmed. Seat${data.booking.seatNumbers.length > 1 ? "s" : ""} ${data.booking.seatNumbers.join(", ")} ${data.booking.seatNumbers.length > 1 ? "are" : "is"} booked.`,
        });
        return "paid";
      } else {
        sessionStorage.removeItem(CUSTOM_CHECKOUT_STORAGE_KEY);
        setPendingClassPayment(null);
        return "cancelled";
      }
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Could not confirm cancellation. Your seats remain held until payment status is resolved.",
      });
      return null;
    } finally {
      setBusySeat("");
    }
  }

  async function resumePayment(hold, mode = "hosted") {
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
        const payment = {
          classId: hold.classId,
          paymentOrderId: hold.paymentOrderId,
          paymentSessionId: data.payment.paymentSessionId,
          environment: data.payment.environment,
          seatNumbers: hold.seatNumbers,
          expiresAt: data.payment.expiresAt,
          returnUrl: data.payment.returnUrl,
        };
        setPendingClassPayment(payment);
        setSelectedId(hold.classId);
        setSelectedSeatNumbers(hold.seatNumbers);
        setBookingStep("payment");
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        await launchCashfreeCheckout(payment, mode);
        return;
      }
      await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
      if (finalPaymentStatus === "pending") {
        const pollId = window.setInterval(() => {
          Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
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
      await Promise.all([loadSessions({ quiet: true }), loadPaymentHolds()]);
    } finally {
      setBusySeat("");
    }
  }

  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user)
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        }}
      />
    );
  const selectedSession = sessions.find(
    (session) => session._id === selectedId,
  );
  const selectedPaymentHold = paymentHolds.find(
    (hold) => String(hold.classId) === String(selectedSession?._id),
  );
  return (
    <section className="section class-booking-page">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      {classPaymentRetrySeconds > 0 && (
        <div className="class-payment-retry-notice" role="status">
          Too many class payment attempts. Try again after 15 min.
        </div>
      )}
      {checkoutActive &&
        checkoutMode === "custom" &&
        pendingClassPayment &&
        selectedSession &&
        createPortal(
          <ClassCashfreeCheckout
            payment={pendingClassPayment}
            sessionTitle={selectedSession.title}
            price={selectedSession.price}
            email={contactEmail.trim().toLowerCase()}
            phone={contactPhone.trim()}
            onBack={requestPaymentExit}
            onPaymentComplete={() =>
              verifyPendingClassPayment(pendingClassPayment)
            }
          />,
          document.body,
        )}
      {showExitConfirm &&
        createPortal(
          <div
            ref={exitPromptRef}
            popover="manual"
            className="class-exit-overlay"
          >
            <section
              className="class-exit-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="class-exit-title"
              aria-describedby="class-exit-description"
            >
              <div className="class-exit-icon" aria-hidden="true">
                <ShieldCheck size={23} />
              </div>
              <span className="eyebrow">SECURE CHECKOUT</span>
              <h2 id="class-exit-title">
                {exitFromCheckout
                  ? "Go back to Make payment?"
                  : "Are you sure you want to exit?"}
              </h2>
              <p id="class-exit-description">
                We’ll verify your payment first. If it has not been paid, your
                seat hold will be released and you’ll return to the Make payment
                page. A confirmed payment will remain booked.
              </p>
              {notice.type === "error" && (
                <p className="class-exit-error" role="alert">
                  {notice.message}
                </p>
              )}
              <div className="class-exit-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busySeat === "cancel"}
                  onClick={continuePaymentAfterPrompt}
                >
                  {exitFromCheckout ? "Continue payment" : "Keep booking"}
                </button>
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={busySeat === "cancel"}
                  onClick={confirmPaymentExit}
                >
                  {busySeat === "cancel"
                    ? "Checking payment…"
                    : exitFromCheckout
                      ? "Exit From payment"
                      : "Yes, exit"}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
      {!selectedSession && (
        <>
          <div className="shop-intro">
            <span className="eyebrow">LEARN TOGETHER</span>
            <h1>
              Book your <em>class seat.</em>
            </h1>
            <p>
              Choose a class, select up to three seats, and pay for them
              together.
            </p>
          </div>
        </>
      )}
      {!selectedSession && (
        <>
          <div className="class-page-actions">
            <p>Welcome {user.name}</p>
          </div>
        </>
      )}
      {loading ? (
        <div className="loading-state">Loading classes…</div>
      ) : selectedSession ? (
        <div className="class-seat-page">
          {!checkoutActive && (
            <button
              type="button"
              className="class-back-link"
              onClick={() => {
                setSelectedId("");
                setSelectedSeatNumbers([]);
                setBookingStep("seats");
                setNotice({ type: "", message: "" });
              }}
            >
              <ArrowLeft size={17} /> All classes
            </button>
          )}
          <article
            className={`class-seat-card ${
              bookingStep === "details"
                ? "class-seat-card-details"
                : "class-seat-card-step"
            }`}
          >
            {bookingStep === "details" && (
              <div className="class-seat-summary">
                <div className="class-detail-heading-row">
                  <div>
                    <span className="eyebrow">CLASS SESSION</span>
                    <h2>{selectedSession.title}</h2>
                  </div>
                  {selectedPaymentHold && (
                    <div className="class-resume-payment-actions">
                      <button
                        type="button"
                        className="btn btn-dark class-resume-payment"
                        disabled={Boolean(busySeat)}
                        onClick={() =>
                          resumePayment(selectedPaymentHold, "custom")
                        }
                      >
                        Custom checkout
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline class-resume-payment"
                        disabled={Boolean(busySeat)}
                        onClick={() =>
                          resumePayment(selectedPaymentHold, "hosted")
                        }
                      >
                        Cashfree hosted
                      </button>
                    </div>
                  )}
                </div>
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
                <div className="class-session-price-row">
                  {Number(selectedSession.price) > 0 ? (
                    <strong className="class-price">
                      ₹{Number(selectedSession.price).toLocaleString("en-IN")}
                      <small>per seat</small>
                    </strong>
                  ) : (
                    <p className="class-price-unavailable">
                      The administrator has not set a price for this session
                      yet.
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn-dark"
                    disabled={!(Number(selectedSession.price) > 0)}
                    onClick={() => setBookingStep("seats")}
                  >
                    Next
                  </button>
                </div>
                <p className="payment-hold-note">
                  Select up to 3 seats. They are reserved only when you submit
                  your contact details to start payment.
                </p>
              </div>
            )}
            {bookingStep === "details" ? null : bookingStep === "seats" ? (
              <div className="class-seat-picker">
                <div className="seat-picker-heading">
                  <b>
                    <Armchair size={18} /> {selectedSession.title}
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
                <div className="seat-checkout">
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={Boolean(busySeat)}
                    onClick={() => {
                      setBookingStep("details");
                      setNotice({ type: "", message: "" });
                    }}
                  >
                    Back
                  </button>
                  <span>
                    {selectedSeatNumbers.length} seat
                    {selectedSeatNumbers.length === 1 ? "" : "s"} selected
                    {selectedSeatNumbers.length > 0 &&
                      ` · Total ₹${(
                        Number(selectedSession.price) *
                        selectedSeatNumbers.length
                      ).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-dark"
                    disabled={!selectedSeatNumbers.length || Boolean(busySeat)}
                    onClick={() => {
                      setBookingStep("contact");
                      setNotice({ type: "", message: "" });
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : bookingStep === "contact" ? (
              <div className="class-contact-panel">
                <form
                  className="class-contact-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (validateContactDetails()) {
                      setBookingStep("payment");
                      setNotice({ type: "", message: "" });
                    }
                  }}
                >
                  <div>
                    <span className="eyebrow">CONTACT DETAILS</span>
                    <h3>Enter your email and mobile number</h3>
                    <p>
                      We’ll use these details to confirm your booking and send
                      your receipt.
                    </p>
                  </div>
                  <div className="class-contact-fields">
                    <label>
                      Email address
                      <input
                        id="class-contact-email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={contactEmail}
                        onChange={(event) =>
                          setContactEmail(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Mobile number
                      <input
                        id="class-contact-phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        required
                        maxLength={20}
                        value={contactPhone}
                        onChange={(event) =>
                          setContactPhone(event.target.value)
                        }
                      />
                      <small>Include your country code if needed.</small>
                    </label>
                    <label className="whatsapp-opt-in">
                      <input
                        type="checkbox"
                        checked={whatsappOptIn}
                        disabled={!profileLoaded || Boolean(busySeat)}
                        onChange={(event) =>
                          setWhatsappOptIn(event.target.checked)
                        }
                      />
                      Send booking updates on WhatsApp (optional).
                    </label>
                  </div>
                  <div className="class-contact-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={Boolean(busySeat)}
                      onClick={() => {
                        setBookingStep("seats");
                        setNotice({ type: "", message: "" });
                      }}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="btn btn-dark"
                      disabled={
                        !selectedSeatNumbers.length || Boolean(busySeat)
                      }
                    >
                      Next
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="class-payment-panel">
                <div className="class-payment-heading">
                  <span className="eyebrow">SECURE PAYMENT</span>
                  <h3>Review and continue to Cashfree</h3>
                  <p>
                    {pendingClassPayment?.expiresAt ? (
                      <>
                        Your seats are held until{" "}
                        {new Date(
                          pendingClassPayment.expiresAt,
                        ).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        . Complete payment before the hold expires.
                      </>
                    ) : (
                      "Your seats are not reserved yet. We’ll check availability and hold them when you click Make payment."
                    )}
                  </p>
                </div>
                <div className="class-payment-summary">
                  <div>
                    <span className="eyebrow">CLASS SESSION</span>
                    <h4>{selectedSession.title}</h4>
                    <p>
                      {pendingClassPayment?.seatNumbers.length ||
                        selectedSeatNumbers.length}{" "}
                      seat
                      {(pendingClassPayment?.seatNumbers.length ||
                        selectedSeatNumbers.length) === 1
                        ? ""
                        : "s"}{" "}
                      ·{" "}
                      {(
                        pendingClassPayment?.seatNumbers || selectedSeatNumbers
                      ).join(", ")}
                    </p>
                    <p className="class-payment-contact">
                      {contactEmail.trim().toLowerCase()}
                    </p>
                    <p className="class-payment-contact">
                      {contactPhone.trim()}
                    </p>
                  </div>
                  <div className="class-payment-total">
                    <span>Total</span>
                    <strong>
                      {(
                        Number(selectedSession.price) *
                        (pendingClassPayment?.seatNumbers.length ||
                          selectedSeatNumbers.length)
                      ).toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                      })}
                    </strong>
                  </div>
                </div>
                <div className="class-contact-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={Boolean(busySeat)}
                    onClick={() => {
                      if (pendingClassPayment) {
                        requestPaymentExit();
                      } else {
                        setBookingStep("contact");
                        setNotice({ type: "", message: "" });
                      }
                    }}
                  >
                    Back
                  </button>
                  <div className="class-checkout-options">
                    <button
                      type="button"
                      className="btn btn-dark"
                      disabled={
                        Boolean(busySeat) ||
                        classPaymentRetrySeconds > 0 ||
                        !selectedSeatNumbers.length ||
                        (pendingClassPayment &&
                          new Date(pendingClassPayment.expiresAt) <= new Date())
                      }
                      onClick={() =>
                        pendingClassPayment
                          ? continueToCashfree("custom")
                          : void prepareClassPayment(selectedSession, "custom")
                      }
                    >
                      {busySeat === "checkout"
                        ? "Opening checkout…"
                        : classPaymentRetrySeconds > 0
                          ? `Try again in ${formatRetryCountdown(classPaymentRetrySeconds)}`
                          : "Custom Card / UPI"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={
                        Boolean(busySeat) ||
                        classPaymentRetrySeconds > 0 ||
                        !selectedSeatNumbers.length ||
                        (pendingClassPayment &&
                          new Date(pendingClassPayment.expiresAt) <= new Date())
                      }
                      onClick={() =>
                        pendingClassPayment
                          ? continueToCashfree("hosted")
                          : void prepareClassPayment(selectedSession, "hosted")
                      }
                    >
                      Cashfree hosted checkout
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                  setBookingStep("details");
                }}
                aria-label={`View details for ${session.title}`}
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
                <span className="class-card-cta">View session details →</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
