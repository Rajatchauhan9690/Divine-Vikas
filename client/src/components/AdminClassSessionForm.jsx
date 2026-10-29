import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../services/api";
import AdminToast from "./AdminToast";

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTimeValue(date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${localDateValue(date)}T${hour}:${minute}`;
}

const initialValues = {
  title: "",
  description: "",
  instructorName: "",
  price: "",
  startDateTime: "",
  durationMinutes: 60,
  seatCount: 20,
};
const sessionsPerPage = 10;
const maxSeatCount = 600;

export default function AdminClassSessionForm() {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [seatCountError, setSeatCountError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionPrices, setSessionPrices] = useState({});
  const [sessionPage, setSessionPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState("");
  const [updatingSession, setUpdatingSession] = useState("");
  const [deletingSession, setDeletingSession] = useState("");
  const sessionFormRef = useRef(null);
  const dismissToast = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (showCreateForm && editingSessionId)
      sessionFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [showCreateForm, editingSessionId]);

  async function loadSessions() {
    try {
      const { data } = await api.get("/classes");
      const loadedSessions = data.sessions || [];
      setSessions(loadedSessions);
      setSessionPage((page) =>
        Math.min(
          page,
          Math.max(1, Math.ceil(loadedSessions.length / sessionsPerPage)),
        ),
      );
      setSessionPrices((current) => ({
        ...current,
        ...Object.fromEntries(
          (data.sessions || [])
            .filter((session) => !(Number(session.price) > 0))
            .map((session) => [session._id, current[session._id] || ""]),
        ),
      }));
      return true;
    } catch (error) {
      setToast({
        type: "error",
        text:
          error.response?.data?.message ||
          "Could not load upcoming class sessions.",
      });
      return false;
    }
  }
  useEffect(() => {
    loadSessions();
  }, []);
  const update = (event) => {
    if (event.target.name === "seatCount") {
      const { value } = event.target;
      const count = Number(value);
      setSeatCountError(
        value && (!Number.isInteger(count) || count < 1 || count > maxSeatCount)
          ? `Enter a whole number from 1 to ${maxSeatCount}.`
          : "",
      );
    }
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const seatCount = Number(values.seatCount);
      if (
        !Number.isInteger(seatCount) ||
        seatCount < 1 ||
        seatCount > maxSeatCount
      ) {
        setSeatCountError(`Enter a whole number from 1 to ${maxSeatCount}.`);
        setToast({
          type: "error",
          text: `Seat count must be a whole number between 1 and ${maxSeatCount}.`,
        });
        return;
      }
      const startMatch = values.startDateTime.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
      );
      if (!startMatch) {
        setToast({
          type: "error",
          text: "Choose a valid start date and time.",
        });
        return;
      }
      const [, yearText, monthText, dayText, hourText, minuteText] = startMatch;
      const hour = Number(hourText);
      const minute = Number(minuteText);
      const start = new Date(
        Number(yearText),
        Number(monthText) - 1,
        Number(dayText),
        hour,
        minute,
      );
      if (
        Number.isNaN(start.getTime()) ||
        localDateTimeValue(start) !== values.startDateTime ||
        start <= new Date()
      ) {
        setToast({
          type: "error",
          text: "Enter a valid future start date and time.",
        });
        return;
      }
      const payload = {
        title: values.title,
        description: values.description,
        instructorName: values.instructorName,
        price: Number(values.price),
        startsAt: start.toISOString(),
        durationMinutes: Number(values.durationMinutes),
        seatCount,
      };
      if (editingSessionId)
        await api.put(`/admin/classes/${editingSessionId}`, payload);
      else await api.post("/admin/classes", payload);
      const wasEditing = Boolean(editingSessionId);
      setValues(initialValues);
      setSeatCountError("");
      setEditingSessionId("");
      setShowCreateForm(false);
      setToast({
        type: "success",
        text: `Class session ${wasEditing ? "updated" : "created"} successfully.`,
      });
      if (!wasEditing) setSessionPage(1);
      if (!(await loadSessions()))
        setToast({
          type: "error",
          text: "Class created, but the session list could not be refreshed.",
        });
    } catch (error) {
      setToast({
        type: "error",
        text:
          error.response?.data?.message ||
          `Could not ${editingSessionId ? "update" : "create"} the class session.`,
      });
    } finally {
      setSaving(false);
    }
  }
  function editSession(session) {
    setValues({
      title: session.title || "",
      description: session.description || "",
      instructorName: session.instructorName || "",
      price: String(session.price ?? ""),
      startDateTime: localDateTimeValue(new Date(session.startsAt)),
      durationMinutes: session.durationMinutes || 60,
      seatCount: session.seats?.length || 1,
    });
    setSeatCountError("");
    setEditingSessionId(session._id);
    setShowCreateForm(true);
  }
  async function deleteSession(session) {
    if (
      !window.confirm(
        `Delete "${session.title}"? Sessions with held or booked seats cannot be deleted.`,
      )
    )
      return;
    setDeletingSession(session._id);
    try {
      await api.delete(`/admin/classes/${session._id}`);
      const loaded = await loadSessions();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? `${session.title} was deleted.`
          : "Session deleted, but the session list could not be refreshed.",
      });
    } catch (error) {
      setToast({
        type: "error",
        text:
          error.response?.data?.message ||
          "Could not delete the class session.",
      });
    } finally {
      setDeletingSession("");
    }
  }
  async function updatePrice(event, session) {
    event.preventDefault();
    setUpdatingSession(session._id);
    try {
      await api.patch(`/admin/classes/${session._id}/price`, {
        price: Number(sessionPrices[session._id]),
      });
      const loaded = await loadSessions();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? `Price updated for ${session.title}.`
          : "Price updated, but the session list could not be refreshed.",
      });
    } catch (error) {
      setToast({
        type: "error",
        text:
          error.response?.data?.message ||
          "Could not update the class price.",
      });
    } finally {
      setUpdatingSession("");
    }
  }
  const sessionPages = Math.max(1, Math.ceil(sessions.length / sessionsPerPage));
  const visibleSessions = sessions.slice(
    (sessionPage - 1) * sessionsPerPage,
    sessionPage * sessionsPerPage,
  );
  return (
    <section className="admin-class-sessions">
      <div className="admin-list-head">
        <div>
          <h2>Class sessions</h2>
          <p>Create a session and generate its seats automatically.</p>
        </div>
        <button
          type="button"
          className={`btn ${showCreateForm ? "btn-admin-cancel" : "btn-dark"}`}
          onClick={() => {
            if (showCreateForm) {
              setShowCreateForm(false);
              setEditingSessionId("");
              setValues(initialValues);
              setSeatCountError("");
            } else setShowCreateForm(true);
          }}
        >
          {showCreateForm ? <X size={16} /> : <CalendarPlus size={16} />}
          {showCreateForm ? "Cancel" : "Add class"}
        </button>
      </div>
      <AdminToast toast={toast} onDismiss={dismissToast} />
      {showCreateForm && (
      <form
        ref={sessionFormRef}
        className="admin-product-form"
        onSubmit={submit}
      >
        <h3 className="admin-form-title wide">
          {editingSessionId ? "Edit class session" : "Add class session"}
        </h3>
        <div className="admin-class-title-group wide">
          <label>
            Class title
            <input
              name="title"
              required
              maxLength="120"
              value={values.title}
              onChange={update}
              placeholder="e.g. Beginner yoga"
            />
          </label>
          <label>
            Description
            <input
              name="description"
              maxLength="1000"
              value={values.description}
              onChange={update}
            />
          </label>
        </div>
        <label>
          Instructor name
          <input
            name="instructorName"
            required
            maxLength="100"
            value={values.instructorName}
            onChange={update}
          />
        </label>
        <label>
          Price per seat (₹)
          <input
            name="price"
            required
            type="number"
            min="1"
            max="1000000"
            step="0.01"
            value={values.price}
            onChange={update}
          />
        </label>
        <label className="admin-class-start-field">
          Start date and time
          <input
            name="startDateTime"
            type="datetime-local"
            lang="en-US"
            required
            value={values.startDateTime}
            onChange={update}
            min={localDateTimeValue(new Date())}
          />
        </label>
        <label>
          Duration (minutes)
          <input
            name="durationMinutes"
            required
            type="number"
            min="1"
            max="600"
            value={values.durationMinutes}
            onChange={update}
          />
        </label>
        <label>
          Number of seats
          <input
            name="seatCount"
            required
            type="number"
            min="1"
            max={maxSeatCount}
            step="1"
            value={values.seatCount}
            aria-invalid={Boolean(seatCountError)}
            aria-describedby="seat-count-help"
            onInvalid={() => {
              const errorText = `Enter a whole number from 1 to ${maxSeatCount}.`;
              setSeatCountError(errorText);
              setToast({ type: "error", text: errorText });
            }}
            onChange={update}
          />
          {seatCountError && (
            <small
              id="seat-count-help"
              className="admin-field-error"
              aria-live="polite"
            >
              {seatCountError}
            </small>
          )}
        </label>
        <button className="btn btn-admin-save wide" disabled={saving}>
          {saving
            ? "Saving…"
            : editingSessionId
              ? "Update class session"
              : "Create class session"}
        </button>
      </form>
      )}
      {sessions.length > 0 && (
        <div className="admin-unpriced-sessions">
          <h3>Manage upcoming sessions</h3>
          <p>
            Sessions with held or booked seats cannot be deleted. Unpriced
            sessions need a price before customers can book.
          </p>
          {visibleSessions.map((session) => (
            <div className="admin-class-session-card" key={session._id}>
              <div className="admin-class-session-card-header">
                <details className="admin-class-session-details">
                  <summary className="admin-class-session-overview">
                    <b>{session.title}</b>
                    <span>
                      {new Date(session.startsAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                        hour12: true,
                      })}
                    </span>
                    <span>
                      {Number(session.price) > 0
                        ? `₹${Number(session.price).toFixed(2)} per seat`
                        : "Price not set"}
                    </span>
                    <small>
                      {session.seats?.length || 0} seats
                      {session.instructorName
                        ? ` · ${session.instructorName}`
                        : ""}
                    </small>
                  </summary>
                  {Number(session.price) <= 0 && (
                    <form
                      className="admin-class-price-editor"
                      onSubmit={(event) => updatePrice(event, session)}
                    >
                      <label>
                        Set price per seat (₹)
                        <input
                          type="number"
                          min="1"
                          max="1000000"
                          step="0.01"
                          required
                          value={sessionPrices[session._id] || ""}
                          onChange={(event) =>
                            setSessionPrices((current) => ({
                              ...current,
                              [session._id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        className="btn btn-admin-save"
                        disabled={updatingSession === session._id}
                      >
                        {updatingSession === session._id
                          ? "Saving…"
                          : "Set price"}
                      </button>
                    </form>
                  )}
                  <p className="admin-class-delete-hint">
                    Sessions with held or booked seats cannot be deleted.
                  </p>
                </details>
                <div className="admin-class-row-actions">
                  <button
                    type="button"
                    className="btn btn-outline admin-class-edit"
                    aria-label={`Edit ${session.title}`}
                    title={
                      session.seats?.some((seat) =>
                        ["pending_payment", "booked"].includes(seat.status),
                      )
                        ? "Sessions with held or booked seats cannot be edited."
                        : "Edit class session"
                    }
                    disabled={session.seats?.some((seat) =>
                      ["pending_payment", "booked"].includes(seat.status),
                    )}
                    onClick={() => editSession(session)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger admin-class-delete"
                    aria-label={
                      deletingSession === session._id
                        ? `Deleting ${session.title}`
                        : `Delete ${session.title}`
                    }
                    title="Delete class session"
                    disabled={deletingSession === session._id}
                    onClick={() => deleteSession(session)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {sessions.length > 0 && (
            <div className="admin-pagination">
              <button
                className="btn btn-outline"
                disabled={sessionPage <= 1}
                onClick={() => setSessionPage((page) => page - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span>
                Page {sessionPage} of {sessionPages} · {sessions.length} sessions
              </span>
              <button
                className="btn btn-outline"
                disabled={sessionPage >= sessionPages}
                onClick={() => setSessionPage((page) => page + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
