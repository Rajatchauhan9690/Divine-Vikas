import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  XCircle,
} from "lucide-react";
import { api } from "../services/api";
import AdminToast from "./AdminToast";
const statuses = ["pending", "paid", "processing", "shipped", "delivered"];
const orderFilters = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];
export default function AdminOrders() {
  const [orders, setOrders] = useState([]),
    [toast, setToast] = useState(null),
    [busy, setBusy] = useState(""),
    [selectedOrderId, setSelectedOrderId] = useState(""),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [pagination, setPagination] = useState({ pages: 1, total: 0 }),
    [totalOrders, setTotalOrders] = useState(0);
  const ordersRequest = useRef(null);
  const pageRef = useRef(page);
  const searchRef = useRef(search.trim());
  const statusRef = useRef(statusFilter);
  pageRef.current = page;
  searchRef.current = search.trim();
  statusRef.current = statusFilter;
  const dismissToast = useCallback(() => setToast(null), []);
  const load = useCallback(async (
    nextPage = pageRef.current,
    query = searchRef.current,
    status = statusRef.current,
  ) => {
    ordersRequest.current?.abort();
    const controller = new AbortController();
    ordersRequest.current = controller;
    try {
      const { data } = await api.get("/admin/orders", {
        params: { page: nextPage, limit: 10, search: query, status },
        signal: controller.signal,
      });
      setOrders(data.orders || []);
      setPagination(data.pagination);
      setTotalOrders(data.totalOrders);
      setPage(data.pagination.page);
      return true;
    } catch (e) {
      if (controller.signal.aborted) return true;
      setToast({
        type: "error",
        text: e.response?.data?.message || "Unable to load orders",
      });
      return false;
    } finally {
      if (ordersRequest.current === controller) ordersRequest.current = null;
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      load(1, search.trim(), statusFilter);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ordersRequest.current?.abort();
    };
  }, [load, search, statusFilter]);
  async function save(order, form) {
    setBusy(order._id);
    try {
      await api.patch(`/orders/${order._id}/status`, form);
      const loaded = await load();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? `Order #${String(order._id).slice(-8).toUpperCase()} updated.`
          : "Order updated, but the order list could not be refreshed.",
      });
    } catch (e) {
      setToast({
        type: "error",
        text: e.response?.data?.message || "Could not update order",
      });
    } finally {
      setBusy("");
    }
  }
  async function cancel(order) {
    const paidOnline =
      order.paymentMethod === "cashfree" && order.paymentStatus === "paid";
    setBusy(order._id);
    try {
      const { data } = await api.post(`/admin/orders/${order._id}/cancel`);
      const loaded = await load();
      const refundStatus = data.order?.refund?.status;
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? paidOnline
            ? `Order cancelled. Cashfree refund: ${refundStatus || "pending"}.`
            : "Order cancelled and reserved stock restored."
          : "Order cancelled, but the order list could not be refreshed.",
      });
      return true;
    } catch (e) {
      setToast({
        type: "error",
        text: e.response?.data?.message || "Could not cancel order",
      });
      return false;
    } finally {
      setBusy("");
    }
  }
  async function manageReturn(order, status) {
    setBusy(order._id);
    try {
      const { data } = await api.patch(`/admin/orders/${order._id}/return`, {
        status,
      });
      const loaded = await load();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? status === "received"
            ? `Return received. Refund status: ${data.order.returnRequest.status}.`
            : `Return request ${status}.`
          : "Return updated, but orders could not be refreshed.",
      });
    } catch (error) {
      setToast({
        type: "error",
        text: error.response?.data?.message || "Could not update return",
      });
    } finally {
      setBusy("");
    }
  }
  async function findCouriers(order, packageData) {
    setBusy(order._id);
    try {
      const { data } = await api.get(`/admin/orders/${order._id}/couriers`, {
        params: packageData,
      });
      if (!data.couriers.length)
        setToast({
          type: "error",
          text: "No available Shiprocket couriers found.",
        });
      return data.couriers;
    } catch (error) {
      setToast({
        type: "error",
        text: error.response?.data?.message || "Could not find couriers",
      });
      return [];
    } finally {
      setBusy("");
    }
  }
  async function createShipment(order, shipmentData) {
    setBusy(order._id);
    try {
      await api.post(`/admin/orders/${order._id}/shipment`, shipmentData);
      const loaded = await load();
      setToast({
        type: loaded ? "success" : "error",
        text: loaded
          ? "Shiprocket shipment and label created."
          : "Shipment created, but orders could not be refreshed.",
      });
    } catch (error) {
      setToast({
        type: "error",
        text: error.response?.data?.message || "Could not create shipment",
      });
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="admin-orders">
      <div className="admin-list-head">
        <div>
          <h2>Orders</h2>
        </div>
        <div className="admin-list-actions">
          <label className="admin-order-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSelectedOrderId("");
                setSearch(event.target.value);
              }}
              placeholder="Search by customer name or amount"
              aria-label="Search orders by customer name or amount"
            />
          </label>
        </div>
      </div>
      <div className="admin-order-filter-row">
        <div className="admin-order-filters" aria-label="Filter orders by status">
          {orderFilters.map((filter) => (
            <button
              type="button"
              key={filter.value || "all"}
              className={`admin-order-filter-chip admin-order-filter-${filter.value || "all"}${statusFilter === filter.value ? " active" : ""}`}
              aria-pressed={statusFilter === filter.value}
              onClick={() => {
                setSelectedOrderId("");
                setStatusFilter(filter.value);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="admin-order-total" aria-live="polite">
          Total orders <strong>{totalOrders}</strong>
        </div>
      </div>
      <AdminToast toast={toast} onDismiss={dismissToast} />
      {orders.length === 0 && (
        <p className="notice">
          {search.trim() ? "No orders match your search." : "No orders found."}
        </p>
      )}
      {selectedOrderId && orders.some((order) => order._id === selectedOrderId) ? (
        <div className="admin-order-detail-view">
          <button
            type="button"
            className="btn btn-outline admin-order-back"
            onClick={() => setSelectedOrderId("")}
          >
            <ChevronLeft size={16} /> Back to orders
          </button>
          {orders
            .filter((order) => order._id === selectedOrderId)
            .map((order) => (
              <OrderRow
                key={order._id}
                order={order}
                busy={busy === order._id}
                save={save}
                cancel={cancel}
                manageReturn={manageReturn}
                findCouriers={findCouriers}
                createShipment={createShipment}
              />
            ))}
        </div>
      ) : (
        <div className="admin-order-card-grid">
          {orders.map((order) => (
            <button
              type="button"
              className="admin-order-card"
              key={order._id}
              onClick={() => setSelectedOrderId(order._id)}
            >
              <span className="admin-order-card-id">
                Order #{String(order._id).slice(-8).toUpperCase()}
              </span>
              <strong>{order.user?.name || "Customer"}</strong>
              <span className="admin-order-card-total">
                ₹{Number(order.total).toLocaleString("en-IN")}
              </span>
              <span className="admin-order-card-meta">
                {order.items.length} {order.items.length === 1 ? "item" : "items"}
                {" · "}
                {new Date(order.createdAt).toLocaleDateString()}
              </span>
              <span className="admin-order-card-meta">
                {order.paymentMethod} · {order.paymentStatus}
              </span>
              <span
                className={`admin-order-card-status status-${order.status}`}
              >
                {order.status}
              </span>
              <span className="admin-order-card-open">View order details</span>
            </button>
          ))}
        </div>
      )}
      {pagination.total > 0 && (
        <div className="admin-pagination">
          <button
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span>
            Page {page} of {pagination.pages} · {pagination.total} orders
          </span>
          <button
            className="btn btn-outline"
            disabled={page >= pagination.pages}
            onClick={() => load(page + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function OrderRow({
  order,
  busy,
  save,
  cancel,
  manageReturn,
  findCouriers,
  createShipment,
}) {
  const [status, setStatus] = useState(order.status),
    [confirmCancel, setConfirmCancel] = useState(false),
    [packageData, setPackageData] = useState({
      weight: "0.5",
      length: "15",
      breadth: "10",
      height: "5",
    }),
    [couriers, setCouriers] = useState([]),
    [courierId, setCourierId] = useState("");
  const cancelledBy = order.statusHistory
    ?.slice()
    .reverse()
    .find((history) => history.status === "cancelled")?.by;
  const returnStatus = order.returnRequest?.status || "none";
  const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt) : null;
  useEffect(() => {
    setStatus(order.status);
  }, [order.status]);
  async function searchCouriers() {
    const choices = await findCouriers(order, packageData);
    setCouriers(choices);
    setCourierId(choices[0] ? String(choices[0].id) : "");
  }
  return (
    <article className="admin-order-row">
      <header className="admin-order-detail-heading">
        <div>
          <span className="admin-order-card-id">
            Order #{String(order._id).slice(-8).toUpperCase()}
          </span>
          <h3>{order.user?.name || "Customer"}</h3>
          <p>
            ₹{Number(order.total).toLocaleString("en-IN")} ·{" "}
            {order.shippingAddress?.city}, {order.shippingAddress?.state} ·{" "}
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className={`admin-order-card-status status-${order.status}`}>
          {order.status}
        </span>
      </header>
      <div className="admin-order-return-deadlines">
        <b>Product return deadlines</b>
        {deliveredAt && !Number.isNaN(deliveredAt.getTime()) && (
          <p>Delivered: {deliveredAt.toLocaleString()}</p>
        )}
        {order.items.map((item, index) => {
          if (item.returnable === false)
            return (
              <p key={`${item.product}-${index}`}>
                {item.name}: Non-returnable
              </p>
            );
          const days = item.returnWindowDays;
          if (
            item.returnable === false ||
            !Number.isInteger(days) ||
            days < 1
          )
            return (
              <p key={`${item.product}-${index}`}>
                {item.name}: Non-returnable (no return window was saved)
              </p>
            );
          const returnBy =
            deliveredAt && !Number.isNaN(deliveredAt.getTime())
              ? new Date(deliveredAt.getTime() + days * 24 * 60 * 60 * 1000)
              : null;
          return (
            <p key={`${item.product}-${index}`}>
              {item.name}:{" "}
              {returnBy
                ? `Return by ${returnBy.toLocaleString()} (${days} ${
                    days === 1 ? "day" : "days"
                  } after delivery)`
                : `${days} ${days === 1 ? "day" : "days"} after delivery; deadline available once delivered`}
            </p>
          );
        })}
      </div>
      <form
        className="admin-order-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(order, { status });
        }}
      >
        <div className="admin-order-fields">
          {cancelledBy && (
            <p className="admin-order-audit">
              Cancelled by {cancelledBy.name || "Admin"}
              {cancelledBy.role ? ` (${cancelledBy.role})` : ""}
            </p>
          )}
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {order.status === "cancelled" && (
                <option value="cancelled" disabled>
                  cancelled
                </option>
              )}
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="admin-order-actions">
            <button
              className="btn btn-dark"
              disabled={busy || order.status === "cancelled"}
            >
              {busy ? "Saving…" : "Save order"}
            </button>
            {["pending", "paid", "processing"].includes(order.status) && (
              <>
                {!confirmCancel ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => setConfirmCancel(true)}
                  >
                    <XCircle size={16} />
                    Cancel order
                  </button>
                ) : (
                  <div className="admin-cancel-confirm">
                    <p>
                      Cancel this order? Reserved stock will be restored.
                      {order.paymentMethod === "cashfree" &&
                        order.paymentStatus === "paid" &&
                        " An automatic Cashfree refund must be accepted before cancellation can complete."}
                    </p>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={async () => {
                        if (await cancel(order)) setConfirmCancel(false);
                      }}
                    >
                      {busy ? "Cancelling…" : "Confirm cancellation"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() => setConfirmCancel(false)}
                    >
                      Keep order
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {returnStatus !== "none" && (
            <div className="admin-order-return">
              <b>Return request: {returnStatus.replaceAll("_", " ")}</b>
              <p>{order.returnRequest.reason}</p>
              {returnStatus === "requested" && (
                <>
                  <button
                    type="button"
                    className="btn btn-dark"
                    disabled={busy}
                    onClick={() => manageReturn(order, "approved")}
                  >
                    Approve return
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => manageReturn(order, "rejected")}
                  >
                    Reject return
                  </button>
                </>
              )}
              {["approved", "refund_failed"].includes(returnStatus) && (
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={busy}
                  onClick={() => manageReturn(order, "received")}
                >
                  {returnStatus === "refund_failed"
                    ? "Retry refund"
                    : "Mark items received and refund"}
                </button>
              )}
              {order.refund?.status &&
                order.refund.status !== "not_requested" && (
                  <small>Cashfree refund: {order.refund.status}</small>
                )}
            </div>
          )}
          {order.status !== "cancelled" &&
            order.paymentStatus === "paid" &&
            ["paid", "processing"].includes(order.status) && (
              <div className="admin-shiprocket">
                <b>Ship with Shiprocket</b>
                {order.shipping?.labelUrl ? (
                  <a
                    className="text-link"
                    href={order.shipping.labelUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open shipping label
                  </a>
                ) : (
                  <>
                    <div className="admin-package-fields">
                      {["weight", "length", "breadth", "height"].map(
                        (field) => (
                          <label key={field}>
                            {field === "weight"
                              ? "Weight (kg)"
                              : `${field[0].toUpperCase()}${field.slice(1)} (cm)`}
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={packageData[field]}
                              onChange={(event) =>
                                setPackageData((current) => ({
                                  ...current,
                                  [field]: event.target.value,
                                }))
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={searchCouriers}
                    >
                      Find available couriers
                    </button>
                    {couriers.length > 0 && (
                      <>
                        <label>
                          Courier
                          <select
                            value={courierId}
                            onChange={(event) =>
                              setCourierId(event.target.value)
                            }
                          >
                            {couriers.map((courier) => (
                              <option key={courier.id} value={courier.id}>
                                {courier.name} · ₹{courier.rate}
                                {courier.estimatedDays
                                  ? ` · ${courier.estimatedDays} days`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn btn-dark"
                          disabled={busy || !courierId}
                          onClick={() =>
                            createShipment(order, {
                              ...packageData,
                              courierId,
                            })
                          }
                        >
                          Create shipment and label
                        </button>
                      </>
                    )}
                  </>
                )}
                {order.shipping?.shipmentId && (
                  <small>
                    Shiprocket shipment #{order.shipping.shipmentId}
                    {!order.shipping.labelUrl &&
                      " — label creation can be retried"}
                  </small>
                )}
              </div>
            )}
        </div>
      </form>
    </article>
  );
}
