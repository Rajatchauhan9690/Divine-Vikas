import { useEffect, useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { api } from "../services/api";
import AdminToast from "./AdminToast";
import AdminCardSkeleton from "./AdminCardSkeleton";

const blankCoupon = {
  code: "",
  description: "",
  discountType: "percent",
  value: "",
  maxDiscountAmount: "",
  minimumOrderAmount: "0",
  startsAt: "",
  endsAt: "",
  usageLimit: "0",
  active: true,
};

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(blankCoupon);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [toast, setToast] = useState(null);

  async function loadCoupons() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/coupons");
      setCoupons(data.coupons || []);
      return true;
    } catch (error) {
      setToast({
        type: "error",
        text: error.response?.data?.message || "Could not load coupons.",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  function resetForm() {
    setForm(blankCoupon);
    setEditingId("");
  }

  function editCoupon(coupon) {
    setEditingId(coupon._id);
    setForm({
      code: coupon.code || "",
      description: coupon.description || "",
      discountType: coupon.discountType,
      value: String(coupon.value),
      maxDiscountAmount:
        coupon.maxDiscountAmount == null ? "" : String(coupon.maxDiscountAmount),
      minimumOrderAmount: String(coupon.minimumOrderAmount || 0),
      startsAt: localDateTime(coupon.startsAt),
      endsAt: localDateTime(coupon.endsAt),
      usageLimit: String(coupon.usageLimit || 0),
      active: coupon.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCoupon(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        value: Number(form.value),
        maxDiscountAmount: form.maxDiscountAmount
          ? Number(form.maxDiscountAmount)
          : null,
        minimumOrderAmount: Number(form.minimumOrderAmount),
        usageLimit: Number(form.usageLimit),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      if (editingId) await api.put(`/admin/coupons/${editingId}`, payload);
      else await api.post("/admin/coupons", payload);
      const wasEditing = Boolean(editingId);
      resetForm();
      const loaded = await loadCoupons();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? `Coupon ${wasEditing ? "updated" : "created"} successfully.`
          : `Coupon ${wasEditing ? "updated" : "created"}, but the list could not be refreshed.`,
      });
    } catch (error) {
      setToast({
        type: "error",
        text: error.response?.data?.message || "Could not save this coupon.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon) {
    try {
      await api.put(`/admin/coupons/${coupon._id}`, {
        ...coupon,
        startsAt: coupon.startsAt || null,
        endsAt: coupon.endsAt || null,
        active: !coupon.active,
      });
      await loadCoupons();
      setToast({
        type: "success",
        text: `${coupon.code} ${coupon.active ? "deactivated" : "activated"}.`,
      });
    } catch (error) {
      setToast({
        type: "error",
        text: error.response?.data?.message || "Could not update this coupon.",
      });
    }
  }

  async function deleteCoupon(coupon) {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    setDeletingId(coupon._id);
    try {
      await api.delete(`/admin/coupons/${coupon._id}`);
      setCoupons((current) => current.filter((entry) => entry._id !== coupon._id));
      setToast({ type: "success", text: `${coupon.code} deleted.` });
    } catch (error) {
      setToast({
        type: "error",
        text: error.response?.data?.message || "Could not delete this coupon.",
      });
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="admin-coupons">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      <form className="admin-coupon-form" onSubmit={saveCoupon}>
        <div className="admin-coupon-form-heading">
          <span className="admin-coupon-icon"><Tag size={18} /></span>
          <div>
            <h2>{editingId ? "Edit coupon" : "Create a coupon"}</h2>
            <p>Set a percentage or fixed discount and control when it can be used.</p>
          </div>
        </div>
        <div className="admin-coupon-grid">
          <label>
            Coupon code
            <input
              required
              minLength="3"
              maxLength="30"
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  code: event.target.value.toUpperCase(),
                }))
              }
              placeholder="WELCOME10"
            />
          </label>
          <label>
            Offer description
            <input
              maxLength="160"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Welcome offer"
            />
          </label>
          <label>
            Discount type
            <select
              value={form.discountType}
              onChange={(event) =>
                setForm((current) => ({ ...current, discountType: event.target.value }))
              }
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount (₹)</option>
            </select>
          </label>
          <label>
            {form.discountType === "percent" ? "Discount (%)" : "Discount (₹)"}
            <input
              required
              type="number"
              min="0.01"
              max={form.discountType === "percent" ? "100" : undefined}
              step="0.01"
              value={form.value}
              onChange={(event) =>
                setForm((current) => ({ ...current, value: event.target.value }))
              }
            />
          </label>
          {form.discountType === "percent" && (
            <label>
              Maximum discount (₹, optional)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.maxDiscountAmount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxDiscountAmount: event.target.value,
                  }))
                }
              />
            </label>
          )}
          <label>
            Minimum order value (₹)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.minimumOrderAmount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  minimumOrderAmount: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Starts at (optional)
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, startsAt: event.target.value }))
              }
            />
          </label>
          <label>
            Ends at (optional)
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, endsAt: event.target.value }))
              }
            />
          </label>
          <label>
            Total uses (0 = unlimited)
            <input
              required
              type="number"
              min="0"
              step="1"
              value={form.usageLimit}
              onChange={(event) =>
                setForm((current) => ({ ...current, usageLimit: event.target.value }))
              }
            />
          </label>
          <label className="admin-coupon-active">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm((current) => ({ ...current, active: event.target.checked }))
              }
            />
            Coupon is active
          </label>
        </div>
        <div className="admin-coupon-form-actions">
          <button className="btn btn-dark" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : <><Plus size={16} /> Create coupon</>}
          </button>
          {editingId && (
            <button type="button" className="btn btn-outline" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="admin-coupon-list">
        <div className="admin-list-head">
          <div>
            <h2>Coupons</h2>
            <p>Manage checkout offers and usage.</p>
          </div>
        </div>
        {loading ? (
          <AdminCardSkeleton
            count={3}
            layout="list"
            className="admin-coupon-cards"
          />
        ) : coupons.length ? (
          <div className="admin-coupon-cards">
            {coupons.map((coupon) => (
              <article className="admin-coupon-card" key={coupon._id}>
                <div className="admin-coupon-card-main">
                  <span className="admin-coupon-code">{coupon.code}</span>
                  <span className={`admin-coupon-status${coupon.active ? " is-active" : ""}`}>
                    {coupon.active ? "Active" : "Inactive"}
                  </span>
                  <b>
                    {coupon.discountType === "percent"
                      ? `${coupon.value}% off${coupon.maxDiscountAmount ? ` · up to ₹${coupon.maxDiscountAmount}` : ""}`
                      : `₹${coupon.value} off`}
                  </b>
                  <small>
                    Minimum ₹{coupon.minimumOrderAmount || 0} ·{" "}
                    {coupon.usageLimit
                      ? `${coupon.redeemedCount || 0}/${coupon.usageLimit} used`
                      : "Unlimited uses"}
                    {coupon.reservedCount
                      ? ` · ${coupon.reservedCount} checkout(s) in progress`
                      : ""}
                  </small>
                  {coupon.description && <small>{coupon.description}</small>}
                </div>
                <div className="admin-coupon-card-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => toggleActive(coupon)}
                  >
                    {coupon.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${coupon.code}`}
                    onClick={() => editCoupon(coupon)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={deletingId === coupon._id}
                    aria-label={`Delete ${coupon.code}`}
                    onClick={() => deleteCoupon(coupon)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-products">No coupons yet. Create your first offer above.</p>
        )}
      </div>
    </div>
  );
}
