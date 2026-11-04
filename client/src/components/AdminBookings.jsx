import { useEffect, useState } from "react";
import {
  Armchair,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  IndianRupee,
  Search,
  UserRound,
} from "lucide-react";
import { api } from "../services/api";
import AdminToast from "./AdminToast";

const seatStatuses = [
  { key: "available", label: "Available", className: "available" },
  { key: "booked", label: "Booked", className: "booked" },
  {
    key: "pending_payment",
    label: "Payment pending",
    className: "pending",
  },
];
const sessionsPerPage = 10;

export default function AdminBookings() {
  const [sessions, setSessions] = useState([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/admin/classes", {
          params: { search: search.trim(), view },
          signal: controller.signal,
        });
        setSessions(data.sessions || []);
        setToast(null);
      } catch (error) {
        if (!controller.signal.aborted) {
          setToast({
            type: "error",
            text:
              error.response?.data?.message ||
              "Could not load session bookings.",
          });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, view]);

  useEffect(() => {
    setPage(1);
  }, [search, view]);

  const pageCount = Math.max(1, Math.ceil(sessions.length / sessionsPerPage));
  const visibleSessions = sessions.slice(
    (page - 1) * sessionsPerPage,
    page * sessionsPerPage,
  );

  return (
    <section className="admin-bookings">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      <div className="admin-bookings-topbar">
        <header className="admin-bookings-heading">
          <div>
            <h2>Session bookings</h2>
          </div>
        </header>
        <div className="admin-bookings-toolbar">
          <label className="admin-bookings-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSelectedSessionId("");
                setSearch(event.target.value);
              }}
              placeholder="Search sessions"
              aria-label="Search class sessions"
            />
          </label>
          <label className="admin-bookings-filter">
            <select
              value={view}
              onChange={(event) => {
                setSelectedSessionId("");
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
      ) : sessions.length ? (
        (() => {
          const selectedSession = sessions.find(
            (session) => session._id === selectedSessionId,
          );
          if (selectedSession) {
            const seats = selectedSession.seats || [];
            const booked = seats.filter((seat) => seat.status === "booked");
            const available = seats.filter(
              (seat) => seat.status === "available",
            );
            const pending = seats.filter(
              (seat) => seat.status === "pending_payment",
            );
            const counts = {
              available: available.length,
              booked: booked.length,
              pending_payment: pending.length,
            };
            return (
              <div className="admin-booking-detail">
                <button
                  type="button"
                  className="btn btn-outline admin-booking-back"
                  onClick={() => setSelectedSessionId("")}
                >
                  <ArrowLeft size={16} /> Back to bookings
                </button>
                <article className="admin-booking-session admin-booking-session-detail">
                  <header className="admin-booking-detail-hero">
                    <div>
                      <span className="admin-booking-detail-kicker">
                        <CalendarDays size={15} aria-hidden="true" />
                        {new Date(selectedSession.startsAt).toLocaleString(
                          [],
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                      <h3>{selectedSession.title}</h3>
                      <p>Review seat availability and attendee status for this class.</p>
                    </div>
                    <span className="admin-booking-capacity"><Armchair size={17} aria-hidden="true" />{seats.length} seats</span>
                  </header>
                  <div className="admin-booking-counts">
                    <div className="admin-booking-count total">
                      <strong>{seats.length}</strong>
                      <span>Total seats</span>
                    </div>
                    {seatStatuses.map((status) => (
                      <div
                        className={`admin-booking-count ${status.className}`}
                        key={status.key}
                      >
                        <strong>{counts[status.key]}</strong>
                        <span>{status.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="admin-booking-detail-body">
                    <section className="admin-booking-seat-map">
                      <div className="admin-booking-seat-heading">
                        <div>
                          <span className="eyebrow">LIVE AVAILABILITY</span>
                          <h4>Seat map</h4>
                        </div>
                        <span className="admin-booking-seat-total">
                          <Armchair size={15} aria-hidden="true" />
                          {seats.length} seats
                        </span>
                      </div>
                      <div className="admin-booking-seat-legend" aria-label="Seat status legend">
                        {seatStatuses.map((status) => (
                          <span key={status.key}>
                            <i className={`admin-booking-seat-dot ${status.className}`} />
                            {status.label}
                          </span>
                        ))}
                      </div>
                      <div className="admin-booking-seat-list admin-booking-seat-map-grid">
                        {seats.map((seat) => {
                          const status = seatStatuses.find(
                            (item) => item.key === seat.status,
                          );
                          return (
                            <span
                              className={`admin-booking-seat ${status?.className || "available"}`}
                              key={seat.seatNumber}
                              title={`${seat.seatNumber} · ${status?.label || "Available"}`}
                            >
                              <Armchair size={15} aria-hidden="true" />
                              {seat.seatNumber}
                            </span>
                          );
                        })}
                      </div>
                    </section>
                    <aside className="admin-booking-session-sidebar">
                      <h4>Session details</h4>
                      <div>
                        <span><UserRound size={16} aria-hidden="true" /> Instructor</span>
                        <strong>{selectedSession.instructorName || "Not specified"}</strong>
                      </div>
                      <div>
                        <span><Clock3 size={16} aria-hidden="true" /> Duration</span>
                        <strong>{selectedSession.durationMinutes || 60} minutes</strong>
                      </div>
                      <div>
                        <span><IndianRupee size={16} aria-hidden="true" /> Price per seat</span>
                        <strong>
                          {Number(selectedSession.price) > 0
                            ? `₹${Number(selectedSession.price).toFixed(2)}`
                            : "Free"}
                        </strong>
                      </div>
                      <div className="admin-booking-sidebar-note">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Seat statuses update as bookings are confirmed.
                      </div>
                    </aside>
                  </div>
                </article>
              </div>
            );
          }
          return (
            <div className="admin-booking-session-list">
              {visibleSessions.map((session) => {
                const seats = session.seats || [];
                const booked = seats.filter(
                  (seat) => seat.status === "booked",
                );
                const available = seats.filter(
                  (seat) => seat.status === "available",
                );
                const pending = seats.filter(
                  (seat) => seat.status === "pending_payment",
                );
                return (
                  <button
                    type="button"
                    className="admin-booking-card"
                    key={session._id}
                    onClick={() => setSelectedSessionId(session._id)}
                  >
                    <span className="admin-booking-card-date eyebrow">
                      {new Date(session.startsAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <span className="admin-booking-card-title">
                      {session.title}
                    </span>
                    <span className="admin-booking-card-instructor">
                      {session.instructorName}
                    </span>
                    <span className="admin-booking-card-meta">
                      <span className="admin-booking-count-badge available">
                        {available.length} available
                      </span>
                      <span className="admin-booking-count-badge booked">
                        {booked.length} booked
                      </span>
                      <span className="admin-booking-count-badge held">
                        {pending.length} held
                      </span>
                      <span className="admin-booking-count-badge total">
                        {seats.length} total seats
                      </span>
                    </span>
                    <span className="admin-booking-card-open">
                      View booking details <ChevronRight size={17} />
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()
      ) : (
        <div className="admin-bookings-empty">
          No class sessions found for this filter.
        </div>
      )}
      {!loading && !selectedSessionId && sessions.length > 0 && (
        <div className="admin-pagination" aria-label="Bookings pagination">
          <button
            type="button"
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span>
            Page {page} of {pageCount} · {sessions.length} sessions
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
      )}
    </section>
  );
}
