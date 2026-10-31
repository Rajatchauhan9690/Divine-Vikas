import { useEffect, useState } from "react";
import {
  Armchair,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
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
              "Could not load class bookings.",
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
            <h2>Class bookings</h2>
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
            const groupedSeats = {
              available,
              booked,
              pending_payment: pending,
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
                <article className="admin-booking-session">
                  <header className="admin-booking-session-header">
                    <div>
                      <span className="eyebrow">
                        {new Date(selectedSession.startsAt).toLocaleString(
                          [],
                          { dateStyle: "medium", timeStyle: "short" },
                        )}
                      </span>
                      <h3>{selectedSession.title}</h3>
                      <p>
                        {selectedSession.instructorName}
                        {Number(selectedSession.price) > 0
                          ? ` · ₹${Number(selectedSession.price).toFixed(2)} per seat`
                          : ""}
                      </p>
                    </div>
                    <span className="admin-booking-capacity">
                      <Armchair size={17} aria-hidden="true" />
                      {seats.length} seats
                    </span>
                  </header>
                  <div className="admin-booking-counts">
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
                  <div className="admin-booking-seat-groups">
                    {seatStatuses.map((status) => (
                      <section
                        className="admin-booking-seat-group"
                        key={status.key}
                      >
                        <h4>
                          {status.label} seats{" "}
                          <span>({counts[status.key]})</span>
                        </h4>
                        {groupedSeats[status.key].length ? (
                          <div className="admin-booking-seat-list">
                            {groupedSeats[status.key].map((seat) => (
                              <span
                                className={`admin-booking-seat ${status.className}`}
                                key={seat.seatNumber}
                              >
                                {seat.seatNumber}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="admin-booking-no-seats">None</p>
                        )}
                      </section>
                    ))}
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
