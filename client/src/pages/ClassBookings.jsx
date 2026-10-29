import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  UserRound,
  Armchair,
  RefreshCw,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";

export default function ClassBookings() {
  const { user, ready } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busySeat, setBusySeat] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/classes");
      setSessions(data.sessions || []);
      setNotice({ type: "", message: "" });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Could not load classes. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadSessions();
  }, [loadSessions, user]);

  async function bookSeat(session, seat) {
    if (!user) {
      setNotice({
        type: "error",
        message: "Please sign in before booking a seat.",
      });
      return;
    }
    const key = `${session._id}:${seat.seatNumber}`;
    setBusySeat(key);
    setNotice({ type: "", message: "" });
    try {
      await api.post(
        `/classes/${session._id}/seats/${encodeURIComponent(seat.seatNumber)}/book`,
      );
      setNotice({
        type: "success",
        message: `Seat ${seat.seatNumber} booked successfully.`,
      });
      await loadSessions();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Booking failed. Refresh and choose an available seat.",
      });
      await loadSessions();
    } finally {
      setBusySeat("");
    }
  }

  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <section className="section class-booking-page">
      <div className="shop-intro">
        <span className="eyebrow">LEARN TOGETHER</span>
        <h1>
          Book your <em>class seat.</em>
        </h1>
        <p>
          Choose a class and reserve an available seat. A seat can only be
          booked once.
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
        <p>
          {user ? (
            `Signed in as ${user.name}`
          ) : (
            <>
              {" "}
              <Link className="text-link" to="/login">
                Sign in
              </Link>{" "}
              to reserve a seat.
            </>
          )}
        </p>
        <button
          className="btn btn-outline"
          onClick={loadSessions}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh classes
        </button>
      </div>
      {loading ? (
        <div className="loading-state">Loading classes…</div>
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
              <article className="class-session-card" key={session._id}>
                <div className="class-session-top">
                  <span className="eyebrow">CLASS SESSION</span>
                  <span
                    className={available ? "seat-count" : "seat-count full"}
                  >
                    {available ? `${available} seats left` : "Fully booked"}
                  </span>
                </div>
                <h2>{session.title}</h2>
                <p className="class-description">
                  {session.description ||
                    "Join this guided class and reserve your place."}
                </p>
                <div className="class-meta">
                  <span>
                    <UserRound size={15} />
                    {session.instructorName}
                  </span>
                  <span>
                    <CalendarDays size={15} />
                    {new Date(session.startsAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <span>
                    <Clock3 size={15} />
                    {session.durationMinutes} minutes
                  </span>
                </div>
                <div className="seat-picker-heading">
                  <b>
                    <Armchair size={16} /> Choose a seat
                  </b>
                  <span>
                    <i className="seat-legend available-legend" /> Available{" "}
                    <i className="seat-legend booked-legend" /> Booked
                  </span>
                </div>
                <div className="seat-grid">
                  {session.seats.map((seat) => {
                    const key = `${session._id}:${seat.seatNumber}`;
                    const isAvailable = seat.status === "available";
                    return (
                      <button
                        key={seat.seatNumber}
                        className={`seat-button ${isAvailable ? "" : "booked"}`}
                        disabled={!isAvailable || busySeat === key}
                        aria-label={`${seat.seatNumber}, ${isAvailable ? "available" : "booked"}`}
                        title={
                          isAvailable
                            ? `Book ${seat.seatNumber}`
                            : `${seat.seatNumber} is booked`
                        }
                        onClick={() => bookSeat(session, seat)}
                      >
                        {busySeat === key ? "…" : seat.seatNumber}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
