import AdminOrders from "../components/AdminOrders";
import AdminClassSessionForm from "../components/AdminClassSessionForm";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Package,
  ShoppingCart,
  Users,
  IndianRupee,
  Plus,
  RefreshCw,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
const blank = {
  name: "",
  price: "",
  category: "",
  shortDescription: "",
  description: "",
  image: null,
  stock: "",
};
export default function Admin() {
  const { user, ready } = useAuth();
  const [data, setData] = useState({ products: [], orders: [], users: [] }),
    [form, setForm] = useState(blank),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  useEffect(() => {
    if (!form.image) {
      setImagePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(form.image);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [form.image]);
  async function load() {
    try {
      const r = await api.get("/admin/dashboard");
      setData(r.data);
    } catch (e) {
      setError(e.response?.data?.message || "Could not load dashboard.");
    }
  }
  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);
  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user || user.role !== "admin") return <Navigate to="/login" replace />;
  async function create(e) {
    e.preventDefault();
    setError("");
    if (
      !form.name.trim() ||
      !form.price ||
      !form.category ||
      !form.stock ||
      !form.shortDescription.trim() ||
      !form.description.trim() ||
      !form.image
    ) {
      setError("Please fill in every product field and choose an image.");
      return;
    }
    setBusy(true);
    try {
      const product = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key !== "image") product.append(key, value);
      }
      if (form.image) product.append("image", form.image);
      await api.post("/admin/products", product);
      setForm(blank);
      setShow(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not create product.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    if (!confirm("Delete this product?")) return;
    try {
      await api.delete(`/admin/products/${id}`);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Delete failed.");
    }
  }
  return (
    <section className="section admin-page">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">STORE MANAGEMENT</span>
          <h1>
            Admin <em>dashboard.</em>
          </h1>
          <p>Welcome back, {user.name}. Here is your store at a glance.</p>
        </div>
        <button className="btn btn-outline" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="metrics-grid">
        <Metric
          icon={<Package />}
          label="Products"
          value={data.products?.length || 0}
        />
        <Metric
          icon={<ShoppingCart />}
          label="Orders"
          value={data.orders?.length || 0}
        />
        <Metric
          icon={<Users />}
          label="Customers"
          value={data.users?.length || 0}
        />
        <Metric
          icon={<IndianRupee />}
          label="Revenue"
          value={`₹${data.revenue || 0}`}
        />
      </div>
      <div className="admin-list-head">
        <div>
          <h2>Products</h2>
          <p>Manage your fragrance catalogue.</p>
        </div>
        <button className="btn btn-dark" onClick={() => setShow(!show)}>
          <Plus size={16} /> Add product
        </button>
      </div>
      {show && (
        <form className="admin-product-form" onSubmit={create}>
          <label>
            Product name
            <input
              required
              minLength="2"
              maxLength="120"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Price (₹)
            <input
              required
              type="number"
              min="1"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>
          <label>
            Category
            <select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Select a category</option>
              <option>Devoted to god</option>
              <option>Mood uplifters</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Stock
            <input
              required
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </label>
          <label className="wide">
            Product image
            <input
              required
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) =>
                setForm({ ...form, image: e.target.files?.[0] || null })
              }
            />
            <small>JPEG, PNG, WebP, or GIF; up to 5 MB.</small>
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Selected product preview"
                style={{ display: "block", maxWidth: 180, marginTop: 8 }}
              />
            )}
          </label>
          <label className="wide">
            Short description
            <input
              required
              maxLength="180"
              value={form.shortDescription}
              onChange={(e) =>
                setForm({ ...form, shortDescription: e.target.value })
              }
            />
          </label>
          <label className="wide">
            Description
            <textarea
              required
              maxLength="3000"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <button className="btn btn-dark" disabled={busy}>
            {busy ? "Saving…" : "Save product"}
          </button>
        </form>
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.products?.map((p) => (
              <tr key={p._id}>
                <td>
                  <div className="table-product">
                    {p.image && <img src={p.image} alt="" />}
                    <b>{p.name}</b>
                  </div>
                </td>
                <td>{p.category}</td>
                <td>₹{p.price}</td>
                <td>{p.stock}</td>
                <td>
                  <button
                    className="table-delete"
                    onClick={() => remove(p._id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.products?.length && (
          <p className="table-empty">
            No products yet. Add your first fragrance above.
          </p>
        )}
      </div>
      <AdminOrders />
      <AdminClassSessionForm />
    </section>
  );
}
function Metric({ icon, label, value }) {
  return (
    <div className="metric-card">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
