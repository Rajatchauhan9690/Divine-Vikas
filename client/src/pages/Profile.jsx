import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
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
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await api.get("/profile");
    setProfile(r.data.profile);
    setName(r.data.profile.name);
    setPhone(r.data.profile.phone || "");
  }
  useEffect(() => {
    if (user)
      load().catch((e) =>
        setError(e.response?.data?.message || "Unable to load profile"),
      );
  }, [user]);
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
      setNotice("Profile updated.");
      setError("");
    } catch (e) {
      setError(e.response?.data?.message || "Could not update profile");
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
      setNotice("Address saved.");
      setError("");
    } catch (e) {
      setError(e.response?.data?.message || "Could not save address");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    if (!confirm("Delete this saved address?")) return;
    try {
      await api.delete(`/profile/addresses/${id}`);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not delete address");
    }
  }
  async function makeDefault(id) {
    try {
      await api.post(`/profile/addresses/${id}/default`);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not set default address");
    }
  }
  function edit(a) {
    setEditing(a._id);
    setForm({ ...empty, ...a });
    window.scrollTo({ top: 500, behavior: "smooth" });
  }
  return (
    <section className="section account-page">
      <span className="eyebrow">YOUR ACCOUNT</span>
      <h1 className="account-title">
        My <em>profile.</em>
      </h1>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="notice error">{error}</p>}
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
          <button className="btn btn-dark" disabled={busy}>
            Save profile
          </button>
        </form>
        <div className="account-card">
          <div className="account-card-heading">
            <h2>Saved addresses</h2>
            <span>{profile?.addresses?.length || 0}/10</span>
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
                  <button onClick={() => remove(a._id)}>Delete</button>
                  {!a.isDefault && (
                    <button onClick={() => makeDefault(a._id)}>
                      Make default
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p>No saved addresses yet. Add one below.</p>
          )}
        </div>
      </div>
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
          {editing && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setEditing("");
                setForm(empty);
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
