import { useEffect, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import AdminToast from "./AdminToast";
import AdminConfirmDialog from "./AdminConfirmDialog";

function localDateTimeValue(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function latestAppointmentStart(periodEnd, durationMinutes) {
  if (!periodEnd || !Number.isFinite(Number(durationMinutes))) return undefined;
  const date = new Date(periodEnd);
  date.setTime(date.getTime() - Number(durationMinutes) * 60 * 1000);
  return localDateTimeValue(date);
}

function newSlotValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  date.setMinutes(0);
  return localDateTimeValue(date);
}

const blankForm = (instructorName = "") => ({
  title: "",
  description: "",
  instructorName,
  price: "",
  durationMinutes: "60",
  slots: [newSlotValue()],
});
const servicesPerPage = 6;

export default function AdminServices() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(() => blankForm(user?.name || ""));
  const [editingId, setEditingId] = useState("");
  const [view, setView] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [deletingService, setDeletingService] = useState("");
  const [subscriptionPeriodEnd, setSubscriptionPeriodEnd] = useState("");

  async function loadServices() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/services", { params: { view } });
      setServices(data.services || []);
      return true;
    } catch (requestError) {
      setToast({
        type: "error",
        text: requestError.response?.data?.message || "Could not load services.",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, [view]);

  useEffect(() => {
    if (user?.role !== "sub_admin") return;
    api
      .get("/sub-admin-subscriptions/me")
      .then(({ data }) =>
        setSubscriptionPeriodEnd(data.subscription?.currentPeriodEnd || ""),
      )
      .catch((requestError) =>
        setToast({
          type: "error",
          text:
            requestError.response?.data?.message ||
            "Could not load your subscription end date.",
        }),
      );
  }, [user?.role]);

  useEffect(() => {
    setPage(1);
  }, [search, view]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function editService(service) {
    const now = new Date();
    const slots = (service.seats || [])
      .filter((slot) => new Date(slot.slotStartsAt) > now)
      .map((slot) => localDateTimeValue(slot.slotStartsAt));
    setForm({
      title: service.title || "",
      description: service.description || "",
      instructorName: service.instructorName || "",
      price: String(service.price ?? ""),
      durationMinutes: String(service.durationMinutes ?? 60),
      slots: slots.length ? slots : [newSlotValue()],
    });
    setEditingId(service._id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(blankForm(user?.name || ""));
    setEditingId("");
    setShowForm(false);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const slots = form.slots.map((value) => new Date(value));
      if (
        slots.some((date) => !Number.isFinite(date.getTime()) || date <= new Date()) ||
        new Set(slots.map((date) => date.toISOString())).size !== slots.length
      ) {
        setToast({ type: "error", text: "Enter unique appointment times in the future." });
        return;
      }
      if (
        user?.role === "sub_admin" &&
        subscriptionPeriodEnd &&
        slots.some(
          (date) =>
            date.getTime() + Number(form.durationMinutes) * 60 * 1000 >
            new Date(subscriptionPeriodEnd).getTime(),
        )
      ) {
        setToast({
          type: "error",
          text: "Appointment times must finish before your subscription ends.",
        });
        return;
      }
      const wasEditing = Boolean(editingId);
      const payload = {
        ...form,
        price: Number(form.price),
        durationMinutes: Number(form.durationMinutes),
        slots: slots.map((date) => date.toISOString()),
      };
      if (editingId) await api.put(`/admin/services/${editingId}`, payload);
      else await api.post("/admin/services", payload);
      resetForm();
      const loaded = await loadServices();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? `Service ${wasEditing ? "updated" : "created"} successfully.`
          : `Service ${wasEditing ? "updated" : "created"}, but the service list could not be refreshed.`,
      });
    } catch (requestError) {
      setToast({
        type: "error",
        text:
          requestError.response?.data?.message ||
          `Could not ${editingId ? "update" : "create"} the service.`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeService(service) {
    setServiceToDelete(null);
    setDeletingService(service._id);
    try {
      await api.delete(`/admin/services/${service._id}`);
      const loaded = await loadServices();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? `${service.title} was deleted.`
          : "Service deleted, but the service list could not be refreshed.",
      });
    } catch (requestError) {
      setToast({
        type: "error",
        text: requestError.response?.data?.message || "Could not delete the service.",
      });
    } finally {
      setDeletingService("");
    }
  }

  const filteredServices = services.filter((service) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      service.title?.toLowerCase().includes(query) ||
      service.instructorName?.toLowerCase().includes(query)
    );
  });
  const pageCount = Math.max(1, Math.ceil(filteredServices.length / servicesPerPage));
  const pagedServices = filteredServices.slice(
    (page - 1) * servicesPerPage,
    page * servicesPerPage,
  );
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <section className="admin-services">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      {serviceToDelete && (
        <AdminConfirmDialog
          title={`Delete "${serviceToDelete.title}"?`}
          description="This appointment and its available times will be permanently deleted. This action cannot be undone."
          busy={deletingService === serviceToDelete._id}
          onCancel={() => setServiceToDelete(null)}
          onConfirm={() => removeService(serviceToDelete)}
        />
      )}
      <header className="admin-list-head admin-service-page-head">
        <div className="admin-service-page-title">
          <h2>Appointments</h2>
          <p>Set a price and publish the exact appointment times customers can book.</p>
        </div>
        <div className="admin-class-session-header-actions">
          <div className="admin-class-session-controls">
            <label className="admin-order-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title or provider"
                aria-label="Search appointments"
              />
            </label>
            <label className="admin-bookings-filter">
              <select
                aria-label="Appointment timeframe"
                value={view}
                onChange={(event) => setView(event.target.value)}
              >
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className={`btn ${showForm ? "btn-admin-cancel" : "btn-dark class-payment-pill"}`}
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? <X size={16} /> : <CalendarPlus size={16} />}
            {showForm ? "Cancel" : "Add appointment"}
          </button>
        </div>
      </header>

      {showForm && (
        <form className="admin-product-form admin-service-editor" onSubmit={submit}>
          <h3 className="admin-form-title wide">
            {editingId ? "Edit appointment" : "Create an appointment"}
          </h3>
          <div className="admin-class-title-group wide">
            <label>
              Appointment name
              <input
                name="title"
                value={form.title}
                onChange={updateField}
                minLength="2"
                maxLength="120"
                required
              />
            </label>
            <label>
              Description
              <input
                name="description"
                value={form.description}
                onChange={updateField}
                maxLength="1000"
              />
            </label>
          </div>
          <label>
            Instructor / provider
            <input
              name="instructorName"
              value={form.instructorName}
              onChange={updateField}
              maxLength="100"
              required
            />
          </label>
          <label>
            Price (₹)
            <input
              name="price"
              type="number"
              min="1"
              max="1000000"
              step="0.01"
              value={form.price}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Duration (minutes)
            <input
              name="durationMinutes"
              type="number"
              min="5"
              max="600"
              step="1"
              value={form.durationMinutes}
              onChange={updateField}
              required
            />
          </label>
          <fieldset className="admin-service-times admin-service-times-wide">
            <legend>Appointment schedule</legend>
            <p className="admin-service-times-intro">
              Add dates and times customers can book. Up to 100 times per
              appointment
              {user?.role === "sub_admin"
                ? ", subject to your plan's total slot limit."
                : "."}
            </p>
            {user?.role === "sub_admin" && subscriptionPeriodEnd && (
              <p className="admin-service-times-deadline">
                Each appointment must finish by{" "}
                {new Date(subscriptionPeriodEnd).toLocaleString()}.
              </p>
            )}
            {form.slots.map((slot, index) => (
              <div className="admin-service-time-row" key={`slot-${index}`}>
                <label>
                  Time {index + 1}
                  <input
                    type="datetime-local"
                    value={slot}
                    max={
                      user?.role === "sub_admin"
                        ? latestAppointmentStart(
                            subscriptionPeriodEnd,
                            form.durationMinutes,
                          )
                        : undefined
                    }
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        slots: current.slots.map((value, slotIndex) =>
                          slotIndex === index ? event.target.value : value,
                        ),
                      }))
                    }
                    required
                  />
                </label>
                {form.slots.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    aria-label={`Remove time ${index + 1}`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        slots: current.slots.filter(
                          (_value, slotIndex) => slotIndex !== index,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline admin-service-add-time"
              disabled={form.slots.length >= 100}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  slots: [...current.slots, newSlotValue()],
                }))
              }
            >
              <Plus size={16} /> Add another time
            </button>
          </fieldset>
          <button className="btn btn-admin-save class-payment-pill wide" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update appointment" : "Create appointment"}
          </button>
        </form>
      )}

      <div className="admin-service-list admin-class-session-list">
        {loading ? (
          <p className="loading-state">Loading services…</p>
        ) : filteredServices.length ? (
          pagedServices.map((service) => {
            const slots = service.seats || [];
            const bookedSlots = slots.filter((slot) => slot.status === "booked");
            const availableSlots = slots.filter(
              (slot) => slot.status === "available" && new Date(slot.slotStartsAt) > new Date(),
            );
            return (
              <article className="admin-class-session-card admin-service-session-card" key={service._id}>
                <div className="admin-class-session-card-header">
                  <div className="admin-class-session-details">
                    <div className="admin-class-session-overview">
                      <b>{service.title}</b>
                      <span>₹{Number(service.price).toFixed(2)} · {service.durationMinutes} min</span>
                      <small>
                        {service.instructorName} · {availableSlots.length} available · {bookedSlots.length} booked
                      </small>
                    </div>
                  </div>
                  <div className="admin-class-row-actions">
                    <button type="button" className="btn btn-outline admin-class-edit" aria-label={`Edit ${service.title}`} onClick={() => editService(service)}>
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn-danger admin-class-delete" aria-label={`Delete ${service.title}`} disabled={deletingService === service._id} onClick={() => setServiceToDelete(service)}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="admin-services-empty">
            {search.trim() ? "No appointments match your search." : "No appointments in this timeframe yet."}
          </p>
        )}
      </div>
      {!loading && filteredServices.length > 0 && (
        <div className="admin-pagination" aria-label="Appointments pagination">
          <button
            type="button"
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span>
            Page {page} of {pageCount} · {filteredServices.length} appointments
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
