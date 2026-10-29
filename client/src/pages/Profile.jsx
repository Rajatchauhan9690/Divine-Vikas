import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import AdminToast from "../components/AdminToast";
const empty = {
  label: "Home",
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  landmark: "",
  isDefault: false,
};
export default function Profile() {
  const { user, ready } = useAuth();
  const [profile, setProfile] = useState(null),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState(""),
    [addressFormOpen, setAddressFormOpen] = useState(false),
    [addressToDelete, setAddressToDelete] = useState(null),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [toast, setToast] = useState(null),
    [busy, setBusy] = useState(false);
  function showToast(type, text) {
    setToast({ type, text });
  }
  async function load() {
    const r = await api.get("/profile");
    setProfile(r.data.profile);
    setName(r.data.profile.name);
    setPhone(r.data.profile.phone || "");
  }
  useEffect(() => {
    if (user)
      load().catch((e) =>
        showToast(
          "error",
          e.response?.data?.message || "Unable to load profile",
        ),
      );
  }, [user]);
  useEffect(() => {
    if (!addressToDelete) return;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) setAddressToDelete(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addressToDelete, busy]);
  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  function change(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch("/profile", { name, phone });
      await load();
      showToast("success", "Profile updated.");
    } catch (e) {
      showToast("error", e.response?.data?.message || "Could not update profile");
    } finally {
      setBusy(false);
    }
  }
  async function setWhatsAppUpdates(enabled) {
    setBusy(true);
    try {
      await api.patch("/profile", { whatsappOptIn: enabled });
      await load();
      showToast(
        "success",
        `WhatsApp updates turned ${enabled ? "on" : "off"}.`,
      );
    } catch (e) {
      showToast(
        "error",
        e.response?.data?.message || "Could not update WhatsApp preference",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveAddress(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) await api.patch(`/profile/addresses/${editing}`, form);
      else await api.post("/profile/addresses", form);
      await load();
      setForm(empty);
      setEditing("");
      setAddressFormOpen(false);
      showToast("success", "Address saved.");
    } catch (e) {
      showToast("error", e.response?.data?.message || "Could not save address");
    } finally {
      setBusy(false);
    }
  }
  async function removeAddress() {
    if (!addressToDelete) return;
    setBusy(true);
    try {
      await api.delete(`/profile/addresses/${addressToDelete._id}`);
      await load();
      setAddressToDelete(null);
      showToast("success", "Address deleted.");
    } catch (e) {
      showToast("error", e.response?.data?.message || "Could not delete address");
    } finally {
      setBusy(false);
    }
  }
  async function makeDefault(id) {
    try {
      await api.post(`/profile/addresses/${id}/default`);
      await load();
      showToast("success", "Default address updated.");
    } catch (e) {
      showToast(
        "error",
        e.response?.data?.message || "Could not set default address",
      );
    }
  }
  function edit(a) {
    setEditing(a._id);
    setForm({ ...empty, ...a });
    setAddressFormOpen(true);
    window.scrollTo({ top: 500, behavior: "smooth" });
  }
  return (
    <section className="section account-page">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      <span className="eyebrow">YOUR ACCOUNT</span>
      <h1 className="account-title">
        My <em>profile.</em>
      </h1>
      <div className="account-grid">
        <form className="account-card" onSubmit={saveProfile}>
          <h2>Personal details</h2>
          <label>
            Full name
            <input
              required
              maxLength="80"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email address
            <input disabled value={profile?.email || user.email} />
          </label>
          <label>
            Phone number
            <input
              value={phone}
              maxLength="20"
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <div className="whatsapp-opt-in">
            <span>
              WhatsApp order and class updates:{" "}
              <b>{profile?.whatsappOptIn ? "On" : "Off"}</b>. You can change
              this preference here or during checkout.
            </span>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() =>
                setWhatsAppUpdates(!profile?.whatsappOptIn)
              }
            >
              Turn {profile?.whatsappOptIn ? "off" : "on"} WhatsApp updates
            </button>
          </div>
          <button className="btn btn-dark" disabled={busy}>
            Save profile
          </button>
        </form>
        <div className="account-card">
          <div className="account-card-heading">
            <h2>Saved addresses</h2>
            <span>{profile?.addresses?.length || 0}/3</span>
          </div>
          {profile?.addresses?.length ? (
            profile.addresses.map((a) => (
              <article className="address-card" key={a._id}>
                <div>
                  <b>
                    {a.label || "Address"}{" "}
                    {a.isDefault && (
                      <small className="default-pill">Default</small>
                    )}
                  </b>
                  <p>
                    {a.fullName} · {a.phone}
                    <br />
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                    <br />
                    {a.city}, {a.state} {a.postalCode}, {a.country}
                  </p>
                </div>
                <div className="address-actions">
                  <button onClick={() => edit(a)}>Edit</button>
                  <button type="button" onClick={() => setAddressToDelete(a)}>
                    Delete
                  </button>
                  {!a.isDefault && (
                    <button onClick={() => makeDefault(a._id)}>
                      Make default
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p>No saved addresses yet.</p>
          )}
          <button
            type="button"
            className="btn btn-outline"
            disabled={
              busy ||
              (!addressFormOpen && !editing && (profile?.addresses?.length || 0) >= 3)
            }
            onClick={() => {
              if (addressFormOpen) {
                setEditing("");
                setForm(empty);
                setAddressFormOpen(false);
              } else {
                setEditing("");
                setForm(empty);
                setAddressFormOpen(true);
              }
            }}
          >
            {addressFormOpen ? "Close address form" : "Add a delivery address"}
          </button>
          {(profile?.addresses?.length || 0) >= 3 && (
            <p>You can save up to 3 delivery addresses. Delete one to add another.</p>
          )}
        </div>
      </div>
      {addressFormOpen && (
      <form className="account-card address-form" onSubmit={saveAddress}>
        <h2>{editing ? "Edit address" : "Add a delivery address"}</h2>
        <div className="account-form-grid">
          <label>
            Label
            <input
              required
              value={form.label}
              onChange={(e) => change("label", e.target.value)}
              placeholder="Home, Work"
            />
          </label>
          <label>
            Full name
            <input
              required
              value={form.fullName}
              onChange={(e) => change("fullName", e.target.value)}
            />
          </label>
          <label>
            Phone
            <input
              required
              value={form.phone}
              onChange={(e) => change("phone", e.target.value)}
            />
          </label>
          <label>
            Address line 1
            <input
              required
              value={form.line1}
              onChange={(e) => change("line1", e.target.value)}
            />
          </label>
          <label>
            Address line 2
            <input
              value={form.line2}
              onChange={(e) => change("line2", e.target.value)}
            />
          </label>
          <label>
            Landmark
            <input
              value={form.landmark}
              onChange={(e) => change("landmark", e.target.value)}
            />
          </label>
          <label>
            City
            <input
              required
              value={form.city}
              onChange={(e) => change("city", e.target.value)}
            />
          </label>
          <label>
            State
            <input
              required
              value={form.state}
              onChange={(e) => change("state", e.target.value)}
            />
          </label>
          <label>
            Postal code
            <input
              required
              value={form.postalCode}
              onChange={(e) => change("postalCode", e.target.value)}
            />
          </label>
          <label>
            Country
            <input
              required
              value={form.country}
              onChange={(e) => change("country", e.target.value)}
            />
          </label>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={Boolean(form.isDefault)}
            onChange={(e) => change("isDefault", e.target.checked)}
          />{" "}
          Set as default address
        </label>
        <div className="inline-actions">
          <button className="btn btn-dark" disabled={busy}>
            {busy ? "Saving…" : editing ? "Update address" : "Save address"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() => {
              setEditing("");
              setForm(empty);
              setAddressFormOpen(false);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
      )}
      {addressToDelete && (
        <div className="confirm-overlay">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-address-title"
            aria-describedby="delete-address-description"
          >
            <h2 id="delete-address-title">Delete saved address?</h2>
            <p id="delete-address-description">
              Delete the {addressToDelete.label || "saved"} address for{" "}
              {addressToDelete.fullName}? This cannot be undone.
            </p>
            <div className="inline-actions">
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                autoFocus
                onClick={() => setAddressToDelete(null)}
              >
                Keep address
              </button>
              <button
                type="button"
                className="btn btn-dark"
                disabled={busy}
                onClick={removeAddress}
              >
                {busy ? "Deleting…" : "Delete address"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
