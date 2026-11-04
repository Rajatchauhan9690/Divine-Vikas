import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Search } from "lucide-react";
import { api } from "../services/api";
import AdminToast from "./AdminToast";

const bookingsPerPage = 6;

function bookingKey(booking) {
  return `${booking.serviceId}-${booking.slotId}`;
}

function formatBookingDate(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminServiceBookings() {
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    api
      .get("/admin/service-bookings")
      .then(({ data }) => {
        if (active) setBookings(data.bookings || []);
      })
      .catch((requestError) => {
        if (active)
          setToast({
            type: "error",
            text:
              requestError.response?.data?.message ||
              "Could not load appointment bookings.",
          });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, view]);

  const visibleBookings = bookings.filter((booking) => {
    const startsAt = new Date(booking.startsAt);
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      booking.serviceTitle?.toLowerCase().includes(query) ||
      booking.customer?.name?.toLowerCase().includes(query) ||
      booking.customer?.email?.toLowerCase().includes(query) ||
      booking.customer?.phone?.toLowerCase().includes(query);
    const matchesView =
      view === "all" ||
      (view === "upcoming" && startsAt >= new Date()) ||
      (view === "past" && startsAt < new Date());
    return matchesSearch && matchesView;
  });
  const pageCount = Math.max(1, Math.ceil(visibleBookings.length / bookingsPerPage));
  const pageBookings = visibleBookings.slice(
    (page - 1) * bookingsPerPage,
    page * bookingsPerPage,
  );
  const selectedBooking = visibleBookings.find(
    (booking) => bookingKey(booking) === selectedBookingId,
  );

  return (
    <section className="admin-bookings admin-service-bookings">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      <div className="admin-bookings-topbar">
        <header className="admin-bookings-heading">
          <div>
            <h2>Appointment bookings</h2>
          </div>
        </header>
        <div className="admin-bookings-toolbar">
          <label className="admin-bookings-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSelectedBookingId("");
                setSearch(event.target.value);
              }}
              placeholder="Search bookings"
              aria-label="Search appointment bookings"
            />
          </label>
          <label className="admin-bookings-filter">
            <select
              value={view}
              aria-label="Booking timeframe"
              onChange={(event) => {
                setSelectedBookingId("");
                setView(event.target.value);
              }}
            >
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
      </div>
      {loading ? (
        <div className="loading-state">Loading bookings…</div>
      ) : selectedBooking ? (
        <div className="admin-booking-detail">
          <button
            type="button"
            className="btn btn-outline admin-booking-back"
            onClick={() => setSelectedBookingId("")}
          >
            <ArrowLeft size={16} /> Back to bookings
          </button>
          <article className="admin-booking-session">
            <header className="admin-booking-session-header">
              <div>
                <span className="eyebrow">
                  {formatBookingDate(selectedBooking.startsAt)}
                </span>
                <h3>{selectedBooking.serviceTitle}</h3>
                <p>
                  {selectedBooking.instructorName || "Service provider"} ·{" "}
                  {selectedBooking.durationMinutes} min · ₹
                  {Number(selectedBooking.price).toFixed(2)}
                </p>
              </div>
              <span
                className={`service-booking-status ${selectedBooking.status}`}
              >
                {selectedBooking.status === "booked"
                  ? "Confirmed"
                  : "Payment pending"}
              </span>
            </header>
            <div className="admin-service-booking-customer">
              <span className="eyebrow">CUSTOMER</span>
              <strong>{selectedBooking.customer?.name || "Customer"}</strong>
              <span>
                {selectedBooking.customer?.email || "No email available"}
              </span>
              {selectedBooking.customer?.phone && (
                <span>{selectedBooking.customer.phone}</span>
              )}
            </div>
          </article>
        </div>
      ) : visibleBookings.length ? (
        <>
          <div className="admin-booking-session-list">
            {pageBookings.map((booking) => (
              <button
                type="button"
                className="admin-booking-card"
                key={bookingKey(booking)}
                onClick={() => setSelectedBookingId(bookingKey(booking))}
              >
                <span className="admin-booking-card-date eyebrow">
                  {formatBookingDate(booking.startsAt)}
                </span>
                <span className="admin-booking-card-title">
                  {booking.serviceTitle}
                </span>
                <span className="admin-booking-card-instructor">
                  {booking.instructorName || "Service provider"}
                </span>
                <span className="admin-booking-card-meta">
                  <span
                    className={`admin-booking-count-badge ${
                      booking.status === "booked" ? "booked" : "held"
                    }`}
                  >
                    {booking.status === "booked"
                      ? "Confirmed"
                      : "Payment pending"}
                  </span>
                  <span className="admin-booking-count-badge total">
                    <Clock3 size={13} /> {booking.durationMinutes} min
                  </span>
                  <span className="admin-booking-count-badge available">
                    ₹{Number(booking.price).toFixed(2)}
                  </span>
                </span>
                <span className="admin-booking-card-open">
                  View booking details <ChevronRight size={17} />
                </span>
              </button>
            ))}
          </div>
          <div className="admin-pagination" aria-label="Booking pagination">
            <button
              type="button"
              className="btn btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span>
              Page {page} of {pageCount} · {visibleBookings.length} bookings
            </span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <div className="admin-bookings-empty">
          {search.trim()
            ? "No appointment bookings match your search."
            : "No appointment bookings found for this timeframe."}
        </div>
      )}
    </section>
  );
}
