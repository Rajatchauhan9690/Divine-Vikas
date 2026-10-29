import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { api } from "../services/api";

const initialValues = {
  title: "",
  description: "",
  instructorName: "",
  startsAt: "",
  durationMinutes: 60,
  seatCount: 20,
};

export default function AdminClassSessionForm() {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const update = (event) =>
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      await api.post("/admin/classes", {
        ...values,
        startsAt: new Date(values.startsAt).toISOString(),
        durationMinutes: Number(values.durationMinutes),
        seatCount: Number(values.seatCount),
      });
      setValues(initialValues);
      setMessage({
        type: "success",
        text: "Class session created with available seats.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error.response?.data?.message ||
          "Could not create the class session.",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="admin-class-sessions">
      <div className="admin-list-head">
        <div>
          <h2>Class sessions</h2>
          <p>Create a session and generate its seats automatically.</p>
        </div>
      </div>
      {message.text && (
        <p
          role="status"
          className={`notice ${message.type === "error" ? "error" : ""}`}
        >
          {message.text}
        </p>
      )}
      <form className="admin-product-form" onSubmit={submit}>
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
          Start date and time
          <input
            name="startsAt"
            required
            type="datetime-local"
            value={values.startsAt}
            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
            onChange={update}
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
            max="200"
            value={values.seatCount}
            onChange={update}
          />
        </label>
        <label className="wide">
          Description
          <input
            name="description"
            maxLength="1000"
            value={values.description}
            onChange={update}
          />
        </label>
        <button className="btn btn-dark" disabled={saving}>
          <CalendarPlus size={16} />
          {saving ? "Creating…" : "Create class session"}
        </button>
      </form>
    </section>
  );
}
