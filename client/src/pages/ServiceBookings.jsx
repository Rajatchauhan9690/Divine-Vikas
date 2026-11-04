import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  UserRound,
  X,
} from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import CashfreeCustomCheckout from "../components/CashfreeCustomCheckout";
import AdminToast from "../components/AdminToast";
import PaymentSuccess from "../components/PaymentSuccess";

const CHECKOUT_STORAGE_KEY = "service-custom-checkout";
const SERVICES_PER_PAGE = 10;
const SLOTS_PER_PAGE = 8;

function slotLabel(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ServiceBookings() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [services, setServices] = useState([]);
  const [servicesPage, setServicesPage] = useState(1);
  const [slotsPage, setSlotsPage] = useState(1);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [payment, setPayment] = useState(null);
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("");
  const [toast, setToast] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentSuccessDetails, setPaymentSuccessDetails] = useState([]);
  const returnHandled = useRef(false);
  const restoreHandled = useRef(false);
  const clearSavedCheckout = () => {
    try {
      sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
    } catch (error) {
      setNotice(error.message || "Could not clear the saved checkout.");
      setNoticeType("error");
    }
  };

  const loadServices = useCallback(async () => {
    try {
      const { data } = await api.get("/services");
      setServices(data.services || []);
      return data.services || [];
    } catch (error) {
      setNotice(
        error.response?.data?.message || "Could not load appointment services.",
      );
      setNoticeType("error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  useEffect(() => {
    if (!user || loading || restoreHandled.current) return;
    restoreHandled.current = true;
    try {
      const saved = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
      if (!saved) return;
      const checkout = JSON.parse(saved);
      if (!checkout || checkout.userId !== user.id) {
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
        return;
      }
      const service = services.find((item) => item._id === checkout.serviceId);
      if (
        !service ||
        typeof checkout.paymentOrderId !== "string" ||
        typeof checkout.paymentSessionId !== "string" ||
        typeof checkout.slotId !== "string" ||
        !checkout.slotStartsAt
      ) {
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
        throw new Error("Saved checkout details are incomplete.");
      }
      setSelectedServiceId(service._id);
      setSelected(service);
      setSelectedSlot({
        slotId: checkout.slotId,
        startsAt: checkout.slotStartsAt,
      });
      setEmail(checkout.email || user.email || "");
      setPhone(checkout.phone || "");
      setPayment(checkout.payment);
    } catch (error) {
      setNotice(error.message || "Could not restore your appointment checkout.");
      setNoticeType("error");
    }
  }, [loading, services, user]);

  useEffect(() => {
    if (!user || user.role === "admin") return;
    setEmail(user.email || "");
    api
      .get("/profile")
      .then(({ data }) => {
        const profile = data.profile;
        const savedPhone =
          profile.addresses?.find((address) => address.isDefault)?.phone ||
          profile.addresses?.[0]?.phone;
        setPhone(profile.phone || savedPhone || "");
      })
      .catch((error) => {
        setNotice(
          error.response?.data?.message ||
            "Could not load your contact details. Enter them before booking.",
        );
        setNoticeType("error");
      });
  }, [user]);

  useEffect(() => {
    const classId = searchParams.get("class_id");
    const orderId = searchParams.get("order_id");
    if (
      !user ||
      searchParams.get("payment") !== "return" ||
      !classId ||
      !orderId ||
      returnHandled.current
    )
      return;
    returnHandled.current = true;
    api
      .post(`/services/${classId}/payments/${encodeURIComponent(orderId)}/verify`)
      .then(async ({ data }) => {
        if (data.paymentStatus === "paid") {
          clearSavedCheckout();
          setPaymentSuccessDetails([
            { label: "Appointment", value: data.booking.classTitle },
          ]);
          setPayment(null);
          setSelected(null);
          setSelectedSlot(null);
          setNotice("");
          setToast(null);
          setPaymentSuccess(true);
          await loadServices();
        } else {
          if (data.paymentStatus === "failed") clearSavedCheckout();
          setNotice(
            data.paymentStatus === "pending"
              ? "Payment is still processing. Your appointment time remains temporarily held."
              : "The appointment payment was not completed.",
          );
          setNoticeType(data.paymentStatus === "pending" ? "info" : "error");
        }
      })
      .catch((error) => {
        setNotice(
          error.response?.data?.message ||
            "Could not confirm your appointment payment.",
        );
        setNoticeType("error");
      })
      .finally(() => setSearchParams({}, { replace: true }));
  }, [loadServices, searchParams, setSearchParams, user]);

  async function startPayment(event) {
    event.preventDefault();
    if (!selected || !selectedSlot || !user) return;
    setBusy(true);
    setNotice("");
    try {
      const { data } = await api.post(
        `/services/${selected._id}/slots/${selectedSlot.slotId}/payment`,
        { email, phone },
      );
      setPayment({
        classId: selected._id,
        paymentOrderId: data.payment.paymentOrderId,
        paymentSessionId: data.payment.paymentSessionId,
        environment: data.payment.environment,
        seatNumbers: data.payment.seatNumbers,
        expiresAt: data.payment.expiresAt,
        returnUrl: data.payment.returnUrl,
      });
      try {
        sessionStorage.setItem(
          CHECKOUT_STORAGE_KEY,
          JSON.stringify({
            userId: user.id,
            serviceId: selected._id,
            slotId: selectedSlot.slotId,
            slotStartsAt: selectedSlot.startsAt,
            payment: {
              classId: selected._id,
              paymentOrderId: data.payment.paymentOrderId,
              paymentSessionId: data.payment.paymentSessionId,
              environment: data.payment.environment,
              seatNumbers: data.payment.seatNumbers,
              expiresAt: data.payment.expiresAt,
              returnUrl: data.payment.returnUrl,
            },
            paymentOrderId: data.payment.paymentOrderId,
            paymentSessionId: data.payment.paymentSessionId,
            email,
            phone,
          }),
        );
      } catch (storageError) {
        setNotice(
          storageError.message ||
            "Could not save your checkout for recovery after a refresh.",
        );
        setNoticeType("error");
      }
      await loadServices();
    } catch (error) {
      setNotice(
        error.response?.data?.message ||
          "Could not reserve this time. Please choose another slot.",
      );
      setNoticeType("error");
      await loadServices();
    } finally {
      setBusy(false);
    }
  }

  async function verifyPayment() {
    try {
      const { data } = await api.post(
        `/services/${payment.classId}/payments/${encodeURIComponent(payment.paymentOrderId)}/verify`,
      );
      if (data.paymentStatus === "paid") {
        clearSavedCheckout();
        setPaymentSuccessDetails([
          { label: "Appointment", value: selected?.title || "Appointment" },
          ...(selectedSlot
            ? [
                {
                  label: "Date & time",
                  value: slotLabel(selectedSlot.startsAt),
                },
              ]
            : []),
        ]);
        setPayment(null);
        setSelected(null);
        setSelectedSlot(null);
        setNotice("");
        setToast(null);
        setPaymentSuccess(true);
        await loadServices();
        return "paid";
      }
      if (data.paymentStatus === "failed") {
        clearSavedCheckout();
        setPayment(null);
        setNotice("Payment was not completed. Select the time again to retry.");
        setNoticeType("error");
        await loadServices();
        return "failed";
      }
      return "pending";
    } catch (error) {
      setNotice(
        error.response?.data?.message ||
          "Could not verify the appointment payment.",
      );
      setNoticeType("error");
      return false;
    }
  }

  async function closeCheckout() {
    try {
      await api.post(
        `/services/${payment.classId}/payments/${encodeURIComponent(payment.paymentOrderId)}/cancel`,
      );
      clearSavedCheckout();
      setPayment(null);
      await loadServices();
    } catch (error) {
      setNotice(
        error.response?.data?.message ||
          "Could not safely close this payment. Your appointment time is still held.",
      );
      setNoticeType("error");
    }
  }

  const selectedServiceDetail = services.find(
    (service) => service._id === selectedServiceId,
  );
  const servicesPageCount = Math.max(
    1,
    Math.ceil(services.length / SERVICES_PER_PAGE),
  );
  const currentServicesPage = Math.min(servicesPage, servicesPageCount);
  const visibleServices = services.slice(
    (currentServicesPage - 1) * SERVICES_PER_PAGE,
    currentServicesPage * SERVICES_PER_PAGE,
  );
  const availableSlots = selectedServiceDetail?.slots || [];
  const slotsPageCount = Math.max(
    1,
    Math.ceil(availableSlots.length / SLOTS_PER_PAGE),
  );
  const currentSlotsPage = Math.min(slotsPage, slotsPageCount);
  const visibleSlots = availableSlots.slice(
    (currentSlotsPage - 1) * SLOTS_PER_PAGE,
    currentSlotsPage * SLOTS_PER_PAGE,
  );

  if (user?.role === "admin")
    return <Navigate to="/admin/services" replace />;

  return (
    <section className="section service-booking-page">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      {paymentSuccess && (
        <PaymentSuccess
          title="Your appointment is confirmed"
          message="Your payment was received and your appointment is booked."
          details={paymentSuccessDetails}
          returnTo="appointments"
          onClose={() => setPaymentSuccess(false)}
        />
      )}
      {payment &&
        selected &&
        createPortal(
          <CashfreeCustomCheckout
            payment={payment}
            sessionTitle={selected.title}
            price={selected.price}
            email={email}
            phone={phone}
            onBack={closeCheckout}
            onPaymentComplete={verifyPayment}
            checkoutTitle="Book your appointment"
            summaryLabel="APPOINTMENT SUMMARY"
            summaryDescription={selectedSlot ? slotLabel(selectedSlot.startsAt) : ""}
            expiryLabel="Time hold expires"
            pendingMessage="Payment is processing. Your selected time remains temporarily held."
            unconfirmedMessage="We could not confirm payment yet. Your selected time remains held while Cashfree responds."
          />,
          document.body,
        )}
      <header
        className={`service-booking-heading${selectedServiceDetail ? " is-detail" : ""}`}
      >
        <span className="eyebrow">
          {selectedServiceDetail ? "APPOINTMENT DETAILS" : "PERSONAL APPOINTMENTS"}
        </span>
        <h1>{selectedServiceDetail ? "Book your appointment." : "Book a service."}</h1>
        <p>
          {selectedServiceDetail
            ? "Choose a time that works for you."
            : "Choose a service and reserve one of its available appointment times."}
        </p>
      </header>
      {notice && <p className={`notice ${noticeType}`} role={noticeType === "error" ? "alert" : "status"}>{notice}</p>}
      {loading ? (
        <p className="loading-state">Loading services…</p>
      ) : selectedServiceDetail ? (
        <div className="service-detail-screen">
          <button
            type="button"
            className="class-back-link"
            onClick={() => {
              setSelectedServiceId("");
              setSlotsPage(1);
            }}
          >
            <ArrowLeft size={17} aria-hidden="true" /> All services
          </button>
          <article className="service-detail-card">
            <header className="service-detail-hero">
              <div className="service-detail-hero-copy">
                <span className="eyebrow">APPOINTMENT SERVICE</span>
                <h2>{selectedServiceDetail.title}</h2>
                <p>
                  {selectedServiceDetail.description ||
                    "A personal session with your service provider."}
                </p>
              </div>
              <div className="service-detail-price">
                <span>Price per appointment</span>
                <strong>
                  {Number(selectedServiceDetail.price).toLocaleString("en-IN", {
                    style: "currency",
                    currency: "INR",
                  })}
                </strong>
              </div>
            </header>
            <div className="service-detail-meta">
              <span>
                <UserRound size={18} aria-hidden="true" />
                <span>
                  <small>Service provider</small>
                  <strong>{selectedServiceDetail.instructorName}</strong>
                </span>
              </span>
              <span>
                <Clock3 size={18} aria-hidden="true" />
                <span>
                  <small>Duration</small>
                  <strong>{selectedServiceDetail.durationMinutes} minutes</strong>
                </span>
              </span>
            </div>
            {selectedServiceDetail.slots?.length ? (
              <div className="service-detail-slots">
                <div className="service-detail-slots-heading">
                  <div>
                    <span className="eyebrow">AVAILABLE TIMES</span>
                    <h2><CalendarDays size={19} aria-hidden="true" /> Choose a time</h2>
                  </div>
                  <span className="service-detail-slot-count">
                    {selectedServiceDetail.slots.length} available
                  </span>
                </div>
                <div className="service-slot-list">
                  {visibleSlots.map((slot) => (
                    <button
                      type="button"
                      className="service-slot-button"
                      key={slot.slotId}
                      disabled={busy}
                      onClick={() => {
                        setSelected(selectedServiceDetail);
                        setSelectedSlot(slot);
                        setNotice("");
                      }}
                    >
                      <span className="service-slot-date">
                        {new Date(slot.startsAt).toLocaleDateString([], {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="service-slot-time">
                        {new Date(slot.startsAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                  ))}
                </div>
                {availableSlots.length > SLOTS_PER_PAGE && (
                  <nav
                    className="orders-pagination"
                    aria-label="Available appointment times pagination"
                  >
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() =>
                        setSlotsPage((current) =>
                          Math.max(1, Math.min(current, slotsPageCount) - 1),
                        )
                      }
                      disabled={currentSlotsPage <= 1}
                    >
                      <ChevronLeft size={16} /> Previous
                    </button>
                    <span>
                      Page {currentSlotsPage} of {slotsPageCount} ·{" "}
                      {availableSlots.length} available times
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() =>
                        setSlotsPage((current) =>
                          Math.min(slotsPageCount, Math.min(current, slotsPageCount) + 1),
                        )
                      }
                      disabled={currentSlotsPage >= slotsPageCount}
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </nav>
                )}
              </div>
            ) : (
              <p className="service-no-slots">No available times at the moment.</p>
            )}
          </article>
        </div>
      ) : services.length ? (
        <>
          <div className="class-session-grid">
            {visibleServices.map((service) => (
              <button
                type="button"
                className="class-session-card"
                key={service._id}
                onClick={() => {
                  setSelectedServiceId(service._id);
                  setSlotsPage(1);
                }}
                aria-label={`View appointment details for ${service.title}`}
              >
                <span className="class-session-top">
                  <span className="eyebrow">APPOINTMENT</span>
                  <span
                    className={
                      service.slots?.length ? "seat-count" : "seat-count full"
                    }
                  >
                    {service.slots?.length
                      ? `${service.slots.length} times available`
                      : "No times available"}
                  </span>
                </span>
                <span className="class-card-title">{service.title}</span>
                <span className="class-description">
                  {service.description ||
                    "Book a personal appointment with your service provider."}
                </span>
                <span className="class-card-meta">
                  <span>
                    <UserRound size={16} /> {service.instructorName}
                  </span>
                  <span>
                    <Clock3 size={16} /> {service.durationMinutes} minutes
                  </span>
                  <span>
                    <CalendarDays size={16} />
                    {Number(service.price).toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                    })}
                  </span>
                </span>
                <span className="class-card-cta">View appointment details →</span>
              </button>
            ))}
          </div>
          {services.length > SERVICES_PER_PAGE && (
            <nav
              className="orders-pagination"
              aria-label="Appointments pagination"
            >
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  setServicesPage((current) =>
                    Math.max(1, Math.min(current, servicesPageCount) - 1),
                  )
                }
                disabled={currentServicesPage <= 1}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span>
                Page {currentServicesPage} of {servicesPageCount} ·{" "}
                {services.length} appointments
              </span>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  setServicesPage((current) =>
                    Math.min(
                      servicesPageCount,
                      Math.min(current, servicesPageCount) + 1,
                    ),
                  )
                }
                disabled={currentServicesPage >= servicesPageCount}
              >
                Next <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="class-empty" role="status" aria-live="polite">
          <CalendarDays size={30} />
          <h2>No appointments available</h2>
          <p>Check back later for new appointment times.</p>
        </div>
      )}
      {selected && selectedSlot && !payment && (
        createPortal(
          <div className="service-booking-modal-backdrop">
            <form className="service-booking-modal" onSubmit={startPayment}>
              <button
                type="button"
                className="service-modal-close"
                aria-label="Close booking details"
                onClick={() => {
                  setSelected(null);
                  setSelectedSlot(null);
                }}
              >
                <X size={20} />
              </button>
              <span className="eyebrow">BOOK YOUR TIME</span>
              <h2>Complete your booking</h2>
              <p className="service-booking-modal-service">{selected.title}</p>
              <div className="service-booking-summary">
                <div>
                  <CalendarDays size={18} />
                  <span>
                    <small>Appointment time</small>
                    <strong>{slotLabel(selectedSlot.startsAt)}</strong>
                  </span>
                </div>
                <div>
                  <Clock3 size={18} />
                  <span>
                    <small>Duration</small>
                    <strong>{selected.durationMinutes} minutes</strong>
                  </span>
                </div>
                <div>
                  <strong className="service-booking-summary-price">
                    {Number(selected.price).toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                    })}
                  </strong>
                  <small>Total</small>
                </div>
              </div>
              <label>
                Email address
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength="254" />
              </label>
              <label>
                Mobile number
                <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength="20" />
              </label>
              {!user && <p>Sign in to complete your booking. <Link to="/login" state={{ from: "/services" }}>Sign in</Link></p>}
              <button className="btn btn-dark btn-full" disabled={busy || !user}>
                {busy ? "Preparing secure checkout…" : `Continue to payment · ₹${Number(selected.price).toFixed(2)}`}
              </button>
            </form>
          </div>,
          document.body,
        )
      )}
    </section>
  );
}
