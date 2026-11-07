import AdminOrders from "../components/AdminOrders";
import AdminBookings from "../components/AdminBookings";
import AdminClassSessionForm from "../components/AdminClassSessionForm";
import AdminServices from "../components/AdminServices";
import AdminServiceBookings from "../components/AdminServiceBookings";
import AdminSubAdmins from "../components/AdminSubAdmins";
import SubAdminSubscription from "../components/SubAdminSubscription";
import AdminToast from "../components/AdminToast";
import AdminConfirmDialog from "../components/AdminConfirmDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import {
  Package,
  ShoppingCart,
  Users,
  IndianRupee,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Pencil,
  UserCheck,
  Mail,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import Seo from "../components/Seo";
const blank = {
  name: "",
  price: "",
  category: "",
  shortDescription: "",
  description: "",
  image: null,
  stock: "",
  returnable: true,
  returnWindowDays: "",
};
const allowedProductImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const maxProductImageSize = 5 * 1024 * 1024;
function validateProductForm(values, requireImage = true) {
  const errors = {};
  const price = Number(values.price);
  const stock = Number(values.stock);
  const returnWindowDays = String(values.returnWindowDays ?? "").trim();

  if (typeof values.name !== "string" || values.name.trim().length < 2)
    errors.name = "Product name must be at least 2 characters.";
  else if (values.name.trim().length > 120)
    errors.name = "Product name cannot exceed 120 characters.";

  if (!values.price || !Number.isFinite(price) || price < 1)
    errors.price = "Enter a valid price of at least ₹1.";

  if (!["Devoted to god", "Mood uplifters", "Other"].includes(values.category))
    errors.category = "Choose a product category.";

  if (!values.stock || !Number.isInteger(stock) || stock < 0)
    errors.stock = "Stock must be a whole number of 0 or more.";

  if (
    values.returnable &&
    (!returnWindowDays ||
      !Number.isInteger(Number(returnWindowDays)) ||
      Number(returnWindowDays) < 1 ||
      Number(returnWindowDays) > 90)
  )
    errors.returnWindowDays =
      "Enter a whole number from 1 to 90 days for a returnable product.";

  if (
    typeof values.shortDescription !== "string" ||
    !values.shortDescription.trim()
  )
    errors.shortDescription = "Enter a short description.";
  else if (values.shortDescription.trim().length > 180)
    errors.shortDescription = "Short description cannot exceed 180 characters.";

  if (typeof values.description !== "string" || !values.description.trim())
    errors.description = "Enter a product description.";
  else if (values.description.trim().length > 3000)
    errors.description = "Description cannot exceed 3000 characters.";

  if (!values.image && requireImage) errors.image = "Choose a product image.";
  else if (
    values.image &&
    !allowedProductImageTypes.includes(values.image.type)
  )
    errors.image = "Choose a JPEG, PNG, WebP, or GIF image.";
  else if (values.image && values.image.size > maxProductImageSize)
    errors.image = "Image must be 5 MB or smaller.";

  return errors;
}
export default function Admin() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const section = location.pathname.replace("/admin", "") || "/";
  const sectionTitle = {
    "/products": "Products",
    "/classes": "Sessions",
    "/bookings": "Session bookings",
    "/orders": "Orders",
    "/services": "Appointments",
    "/service-bookings": "Appointment bookings",
    "/sub-admins": "Sub-admins",
    "/subscription": "Subscription",
  }[section];
  const [data, setData] = useState({ products: [], orders: [], users: [] }),
    [dateRange, setDateRange] = useState({ from: "", to: "" }),
    [appliedDateRange, setAppliedDateRange] = useState({ from: "", to: "" }),
    [form, setForm] = useState(blank),
    [show, setShow] = useState(false),
    [editingProductId, setEditingProductId] = useState(""),
    [toast, setToast] = useState(null),
    [busy, setBusy] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [productErrors, setProductErrors] = useState({});
  const [productValidationAttempted, setProductValidationAttempted] =
    useState(false);
  const [deletingProduct, setDeletingProduct] = useState("");
  const [productToDelete, setProductToDelete] = useState(null);
  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [productPagination, setProductPagination] = useState({
    page: 1,
    pages: 1,
    total: 0,
  });
  const productsRequest = useRef(null);
  const productPageRef = useRef(productPage);
  const productSearchRef = useRef(productSearch.trim());
  productPageRef.current = productPage;
  productSearchRef.current = productSearch.trim();
  const productFormRef = useRef(null);
  const dismissToast = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (show && editingProductId)
      productFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [show, editingProductId]);

  useEffect(() => {
    if (!form.image) return;
    const previewUrl = URL.createObjectURL(form.image);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [form.image]);
  async function load(range = appliedDateRange) {
    try {
      const r = await api.get("/admin/dashboard", {
        params: {
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {}),
        },
      });
      setData(r.data);
      return true;
    } catch (e) {
      setToast({
        type: "error",
        text: e.response?.data?.message || "Could not load dashboard.",
      });
      return false;
    }
  }
  async function applyDashboardDateRange(event) {
    event.preventDefault();
    if (dateRange.from && dateRange.to && dateRange.from > dateRange.to) {
      setToast({
        type: "error",
        text: "The start date must be on or before the end date.",
      });
      return;
    }
    const range = { ...dateRange };
    setAppliedDateRange(range);
    await load(range);
  }
  async function resetDashboardDateRange() {
    const range = { from: "", to: "" };
    setDateRange(range);
    setAppliedDateRange(range);
    await load(range);
  }
  async function loadProducts(
    page = productPageRef.current,
    search = productSearchRef.current,
  ) {
    productsRequest.current?.abort();
    const controller = new AbortController();
    productsRequest.current = controller;
    try {
      const { data: result } = await api.get("/admin/products", {
        params: { page, limit: 10, search },
        signal: controller.signal,
      });
      if (result.pagination.total && page > result.pagination.pages)
        return loadProducts(result.pagination.pages, search);
      setData((current) => ({ ...current, products: result.products || [] }));
      setProductPagination(result.pagination);
      setProductPage(result.pagination.page);
      return true;
    } catch (e) {
      if (controller.signal.aborted) return true;
      setToast({
        type: "error",
        text: e.response?.data?.message || "Could not load products.",
      });
      return false;
    } finally {
      if (productsRequest.current === controller)
        productsRequest.current = null;
    }
  }
  useEffect(() => {
    if (user?.role !== "admin") return;
    if (section === "/") load();
  }, [user, section]);
  useEffect(() => {
    if (user?.role !== "admin" || section !== "/products") return;
    const timer = window.setTimeout(() => {
      loadProducts(1, productSearch.trim());
    }, 300);
    return () => {
      window.clearTimeout(timer);
      productsRequest.current?.abort();
    };
  }, [user, section, productSearch]);
  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user || !["admin", "sub_admin"].includes(user.role))
    return <Navigate to="/login" replace />;
  if (
    user.role === "sub_admin" &&
    !["/services", "/service-bookings", "/subscription"].includes(section)
  )
    return <Navigate to="/admin/services" replace />;
  async function create(e) {
    e.preventDefault();
    const errors = validateProductForm(form, !editingProductId);
    setProductErrors(errors);
    setProductValidationAttempted(true);
    if (Object.keys(errors).length) {
      setToast({
        type: "error",
        text: Object.values(errors)[0],
      });
      return;
    }
    setBusy(true);
    try {
      const product = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key !== "image") product.append(key, value);
      }
      if (form.image) product.append("image", form.image);
      if (editingProductId)
        await api.put(`/admin/products/${editingProductId}`, product);
      else await api.post("/admin/products", product);
      const wasEditing = Boolean(editingProductId);
      setForm(blank);
      setProductErrors({});
      setProductValidationAttempted(false);
      setEditingProductId("");
      setImagePreview("");
      setShow(false);
      const loaded = await loadProducts(wasEditing ? productPage : 1);
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? `Product ${wasEditing ? "updated" : "created"} successfully.`
          : `Product ${wasEditing ? "updated" : "created"}, but the product list could not be refreshed.`,
      });
    } catch (e) {
      setToast({
        type: "error",
        text:
          e.response?.data?.message ||
          `Could not ${editingProductId ? "update" : "create"} product.`,
      });
    } finally {
      setBusy(false);
    }
  }
  function updateProductField(field, value) {
    const next = { ...form, [field]: value };
    setForm(next);
    if (productValidationAttempted)
      setProductErrors(validateProductForm(next, !editingProductId));
  }
  function editProduct(product) {
    setForm({
      name: product.name || "",
      price: String(product.price ?? ""),
      category: product.category || "",
      shortDescription: product.shortDescription || "",
      description: product.description || "",
      image: null,
      stock: String(product.stock ?? ""),
      returnable:
        product.returnable !== false &&
        Number.isInteger(product.returnWindowDays) &&
        product.returnWindowDays >= 1,
      returnWindowDays:
        product.returnWindowDays == null
          ? ""
          : String(product.returnWindowDays),
    });
    setImagePreview(product.image || "");
    setProductErrors({});
    setProductValidationAttempted(false);
    setEditingProductId(product._id);
    setShow(true);
  }
  async function remove(id) {
    setProductToDelete(null);
    setDeletingProduct(id);
    try {
      await api.delete(`/admin/products/${id}`);
      const loaded = await loadProducts();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? "Product deleted successfully."
          : "Product deleted, but the product list could not be refreshed.",
      });
    } catch (e) {
      setToast({
        type: "error",
        text: e.response?.data?.message || "Delete failed.",
      });
    } finally {
      setDeletingProduct("");
    }
  }
  return (
    <section
      className={`section admin-page${user.role === "sub_admin" ? " admin-page-sub-admin" : ""}`}
    >
      <Seo
        title={`${sectionTitle || "Dashboard"} Management`}
        description="Private Divine Vikas administration workspace."
        robots="noindex, nofollow"
      />
      <div className="admin-heading">
        <div>
          <span className="eyebrow">STORE MANAGEMENT</span>
          <h1>
            {user.role === "admin" ? "Admin" : "Service workspace"}{" "}
            <em>{sectionTitle || "dashboard"}.</em>
          </h1>
          <p>
            Welcome back, {user.name}.
            {sectionTitle
              ? ` Manage ${sectionTitle.toLowerCase()} here.`
              : " Here is your store at a glance."}
          </p>
        </div>
        {section === "/" && (
          <button
            className="btn btn-outline"
            onClick={() => load(appliedDateRange)}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        )}
      </div>
      <AdminToast toast={toast} onDismiss={dismissToast} />
      {productToDelete && (
        <AdminConfirmDialog
          title={`Delete "${productToDelete.name}"?`}
          description="This product will be permanently deleted. This action cannot be undone."
          busy={deletingProduct === productToDelete._id}
          onCancel={() => setProductToDelete(null)}
          onConfirm={() => remove(productToDelete._id)}
        />
      )}
      <nav className="admin-section-nav" aria-label="Admin sections">
        {user.role === "admin" ? (
          <>
            <NavLink to="/admin" end>
              Overview
            </NavLink>
            <NavLink to="/admin/products">Products</NavLink>
            <NavLink to="/admin/classes">Sessions</NavLink>
            <NavLink to="/admin/services">Appointments</NavLink>
            <NavLink to="/admin/bookings">Session Bookings</NavLink>
            <NavLink to="/admin/service-bookings">Appointment Bookings</NavLink>
            <NavLink to="/admin/orders">Orders</NavLink>
            <NavLink to="/admin/sub-admins">Sub-Admins</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/admin/services">Appointments</NavLink>
            <NavLink to="/admin/service-bookings">Appointment bookings</NavLink>
            <NavLink to="/admin/subscription">Subscription</NavLink>
          </>
        )}
      </nav>
      {section === "/" && user.role === "admin" && (
        <form
          className="admin-dashboard-date-filter"
          onSubmit={applyDashboardDateRange}
        >
          <div className="admin-dashboard-date-copy">
            <h2>Overview</h2>
            <p>Filter dashboard activity by date range.</p>
          </div>
          <label>
            From
            <input
              type="date"
              value={dateRange.from}
              max={dateRange.to || undefined}
              onChange={(event) =>
                setDateRange((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={dateRange.to}
              min={dateRange.from || undefined}
              onChange={(event) =>
                setDateRange((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </label>
          <button type="submit" className="btn btn-dark">
            Apply
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={resetDashboardDateRange}
            disabled={!appliedDateRange.from && !appliedDateRange.to}
          >
            Reset
          </button>
        </form>
      )}
      {section === "/" && user.role === "admin" && (
        <div className="metrics-grid">
          <Metric
            icon={<Package />}
            label="Products"
            value={data.metrics?.products || 0}
          />
          <Metric
            icon={<ShoppingCart />}
            label="Orders"
            value={data.metrics?.orders || 0}
          />
          <Metric
            icon={<Users />}
            label="Customers"
            value={data.metrics?.users || 0}
          />
          <Metric
            icon={<IndianRupee />}
            label="Revenue"
            value={`₹${data.revenue || 0}`}
          />
          <Metric
            icon={<CalendarCheck />}
            label="Sessions"
            value={data.metrics?.classSessions || 0}
          />
          <Metric
            icon={<CalendarDays />}
            label="Session bookings"
            value={data.metrics?.classBookings || 0}
          />
          <Metric
            icon={<ClipboardList />}
            label="Appointment bookings"
            value={data.metrics?.serviceBookings || 0}
          />
          <Metric
            icon={<UserCheck />}
            label="Active sub-admins"
            value={data.metrics?.activeSubAdmins || 0}
          />
          <Metric
            icon={<Mail />}
            label="Pending invites"
            value={data.metrics?.pendingInvitations || 0}
          />
        </div>
      )}
      {section === "/products" && (
        <>
          <div className="admin-list-head">
            <div>
              <h2>Products</h2>
            </div>
            <div className="admin-list-actions">
              <label className="admin-order-search">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search products"
                  aria-label="Search products by name or description"
                />
              </label>
              <button
                type="button"
                className={`btn ${show ? "btn-admin-cancel" : "btn-dark class-payment-pill"}`}
                onClick={() => {
                  if (show) {
                    setShow(false);
                    setEditingProductId("");
                    setForm(blank);
                    setProductErrors({});
                    setProductValidationAttempted(false);
                    setImagePreview("");
                  } else setShow(true);
                }}
              >
                {show ? <X size={16} /> : <Plus size={16} />}
                {show ? "Cancel" : "Add product"}
              </button>
            </div>
          </div>
          {show && (
            <form
              ref={productFormRef}
              className="admin-product-form"
              noValidate
              onSubmit={create}
            >
              <h3 className="admin-form-title wide">
                {editingProductId ? "Edit product" : "Add product"}
              </h3>
              <label>
                Product name
                <input
                  required
                  minLength="2"
                  maxLength="120"
                  aria-invalid={Boolean(productErrors.name)}
                  aria-describedby={
                    productErrors.name ? "product-name-help" : undefined
                  }
                  value={form.name}
                  onChange={(e) => updateProductField("name", e.target.value)}
                />
                {productValidationAttempted && productErrors.name && (
                  <small
                    id="product-name-help"
                    className="admin-field-error"
                    role="alert"
                  >
                    {productErrors.name}
                  </small>
                )}
              </label>
              <label>
                Price (₹)
                <input
                  required
                  type="number"
                  min="1"
                  step="0.01"
                  aria-invalid={Boolean(productErrors.price)}
                  aria-describedby={
                    productErrors.price ? "product-price-help" : undefined
                  }
                  value={form.price}
                  onChange={(e) => updateProductField("price", e.target.value)}
                />
                {productValidationAttempted && productErrors.price && (
                  <small
                    id="product-price-help"
                    className="admin-field-error"
                    role="alert"
                  >
                    {productErrors.price}
                  </small>
                )}
              </label>
              <label>
                Category
                <select
                  required
                  aria-invalid={Boolean(productErrors.category)}
                  aria-describedby={
                    productErrors.category ? "product-category-help" : undefined
                  }
                  value={form.category}
                  onChange={(e) =>
                    updateProductField("category", e.target.value)
                  }
                >
                  <option value="">Select a category</option>
                  <option>Devoted to god</option>
                  <option>Mood uplifters</option>
                  <option>Other</option>
                </select>
                {productValidationAttempted && productErrors.category && (
                  <small
                    id="product-category-help"
                    className="admin-field-error"
                    role="alert"
                  >
                    {productErrors.category}
                  </small>
                )}
              </label>
              <label>
                Stock
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  aria-invalid={Boolean(productErrors.stock)}
                  aria-describedby={
                    productErrors.stock ? "product-stock-help" : undefined
                  }
                  value={form.stock}
                  onChange={(e) => updateProductField("stock", e.target.value)}
                />
                {productValidationAttempted && productErrors.stock && (
                  <small
                    id="product-stock-help"
                    className="admin-field-error"
                    role="alert"
                  >
                    {productErrors.stock}
                  </small>
                )}
              </label>
              <label>
                Return window (days)
                <input
                  type="number"
                  min="1"
                  max="90"
                  step="1"
                  required={form.returnable}
                  disabled={!form.returnable}
                  aria-invalid={Boolean(productErrors.returnWindowDays)}
                  aria-describedby={
                    productErrors.returnWindowDays
                      ? "product-return-window-help"
                      : "product-return-window-note"
                  }
                  value={form.returnWindowDays}
                  onChange={(e) =>
                    updateProductField("returnWindowDays", e.target.value)
                  }
                />
                <small
                  id={
                    productErrors.returnWindowDays
                      ? "product-return-window-help"
                      : "product-return-window-note"
                  }
                  className={
                    productErrors.returnWindowDays
                      ? "admin-field-error"
                      : "admin-field-help"
                  }
                >
                  {productValidationAttempted && productErrors.returnWindowDays
                    ? productErrors.returnWindowDays
                    : form.returnable
                      ? "Required for returnable products. Counted from the delivery date."
                      : "This product is marked non-returnable."}
                </small>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={!form.returnable}
                  onChange={(event) => {
                    const nonReturnable = event.target.checked;
                    const next = {
                      ...form,
                      returnable: !nonReturnable,
                      ...(nonReturnable ? { returnWindowDays: "" } : {}),
                    };
                    setForm(next);
                    if (productValidationAttempted)
                      setProductErrors(
                        validateProductForm(next, !editingProductId),
                      );
                  }}
                />{" "}
                Non-returnable
              </label>
              <label className="wide">
                Product image
                <input
                  required={!editingProductId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  aria-invalid={Boolean(productErrors.image)}
                  aria-describedby="product-image-help"
                  onChange={(e) =>
                    updateProductField("image", e.target.files?.[0] || null)
                  }
                />
                <small
                  id="product-image-help"
                  className={
                    productErrors.image
                      ? "admin-field-error"
                      : "admin-field-help"
                  }
                  aria-live="polite"
                >
                  {productValidationAttempted && productErrors.image
                    ? productErrors.image
                    : editingProductId
                      ? "Choose a new image only if you want to replace the current one. JPEG, PNG, WebP, or GIF; up to 5 MB."
                      : "JPEG, PNG, WebP, or GIF; up to 5 MB."}
                </small>
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
                  aria-invalid={Boolean(productErrors.shortDescription)}
                  aria-describedby={
                    productErrors.shortDescription
                      ? "product-short-description-help"
                      : undefined
                  }
                  value={form.shortDescription}
                  onChange={(e) =>
                    updateProductField("shortDescription", e.target.value)
                  }
                />
                {productValidationAttempted &&
                  productErrors.shortDescription && (
                    <small
                      id="product-short-description-help"
                      className="admin-field-error"
                      role="alert"
                    >
                      {productErrors.shortDescription}
                    </small>
                  )}
              </label>
              <label className="wide">
                Description
                <input
                  required
                  maxLength="3000"
                  aria-invalid={Boolean(productErrors.description)}
                  aria-describedby={
                    productErrors.description
                      ? "product-description-help"
                      : undefined
                  }
                  value={form.description}
                  onChange={(e) =>
                    updateProductField("description", e.target.value)
                  }
                />
                {productValidationAttempted && productErrors.description && (
                  <small
                    id="product-description-help"
                    className="admin-field-error"
                    role="alert"
                  >
                    {productErrors.description}
                  </small>
                )}
              </label>
              <button
                className="btn btn-admin-save class-payment-pill"
                disabled={busy}
              >
                {busy
                  ? "Saving…"
                  : editingProductId
                    ? "Update product"
                    : "Save product"}
              </button>
            </form>
          )}
          <div className="admin-product-list">
            {data.products?.map((p) => (
              <article className="admin-product-card" key={p._id}>
                <div className="admin-product-overview">
                  <div className="admin-product-identity">
                    {p.image && <img src={p.image} alt="" />}
                    <b>{p.name}</b>
                  </div>
                  <div className="admin-product-meta">
                    <span>{p.category}</span>
                    <span>₹{p.price}</span>
                    <span>{p.stock} in stock</span>
                    <span>
                      {p.returnable === false
                        ? "Non-returnable"
                        : p.returnWindowDays
                          ? `${p.returnWindowDays}-day returns`
                          : "Return policy not set"}
                    </span>
                  </div>
                </div>
                <div className="admin-row-actions">
                  <button
                    type="button"
                    className="btn btn-outline admin-product-edit"
                    aria-label={`Edit ${p.name}`}
                    title="Edit product"
                    onClick={() => editProduct(p)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger admin-product-delete"
                    aria-label={
                      deletingProduct === p._id
                        ? `Deleting ${p.name}`
                        : `Delete ${p.name}`
                    }
                    title="Delete product"
                    disabled={deletingProduct === p._id}
                    onClick={() => setProductToDelete(p)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
            {!data.products?.length && (
              <p className="table-empty">
                {productSearch.trim()
                  ? "No products match your search."
                  : "No products yet. Add your first fragrance above."}
              </p>
            )}
          </div>
          {productPagination.total > 0 && (
            <div className="admin-pagination">
              <button
                className="btn btn-outline"
                disabled={productPage <= 1}
                onClick={() => loadProducts(productPage - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span>
                Page {productPage} of {productPagination.pages} ·{" "}
                {productPagination.total} products
              </span>
              <button
                className="btn btn-outline"
                disabled={productPage >= productPagination.pages}
                onClick={() => loadProducts(productPage + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
      {section === "/orders" && <AdminOrders />}
      {section === "/classes" && <AdminClassSessionForm />}
      {section === "/bookings" && <AdminBookings />}
      {section === "/services" && <AdminServices />}
      {section === "/service-bookings" && <AdminServiceBookings />}
      {section === "/sub-admins" && user.role === "admin" && (
        <AdminSubAdmins onToast={setToast} />
      )}
      {section === "/subscription" && user.role === "sub_admin" && (
        <SubAdminSubscription />
      )}
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
