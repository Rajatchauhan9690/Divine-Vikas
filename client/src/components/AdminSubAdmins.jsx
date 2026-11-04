import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MailPlus,
  Send,
  Settings2,
  UsersRound,
} from "lucide-react";
import { api } from "../services/api";

const invitesPerPage = 8;
const appointmentsPerPage = 8;

function ListPagination({
  page,
  pages,
  total,
  onPageChange,
  label,
  alwaysShow = false,
}) {
  if (!alwaysShow && total <= invitesPerPage) return null;
  return (
    <div className="admin-pagination" aria-label={`${label} pagination`}>
      <button
        type="button"
        className="btn btn-outline"
        disabled={page <= 1}
        onClick={() => onPageChange((current) => current - 1)}
      >
        <ChevronLeft size={16} /> Previous
      </button>
      <span>Page {page} of {pages} · {total} {label}</span>
      <button
        type="button"
        className="btn btn-outline"
        disabled={page >= pages}
        onClick={() => onPageChange((current) => current + 1)}
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function AdminSubAdmins({ onToast }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [invitations, setInvitations] = useState([]);
  const [subAdmins, setSubAdmins] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("monthly");
  const [selectedView, setSelectedView] = useState("invite");
  const [pendingPage, setPendingPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const [error, setError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountServices, setAccountServices] = useState([]);
  const [accountAppointmentsPage, setAccountAppointmentsPage] = useState(1);
  const [accountServicesLoading, setAccountServicesLoading] = useState(false);
  const [accountServicesError, setAccountServicesError] = useState("");

  async function load() {
    try {
      const [invitationResponse, planResponse] = await Promise.all([
        api.get("/admin/sub-admin-invitations"),
        api.get("/admin/sub-admin-subscription-plans"),
      ]);
      setInvitations(invitationResponse.data.invitations || []);
      setSubAdmins(invitationResponse.data.subAdmins || []);
      setPlans(planResponse.data.plans || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load sub-admin invitations.",
      );
    }
  }

  function updatePlan(key, field, value) {
    setPlans((current) =>
      current.map((plan) =>
        plan.key === key ? { ...plan, [field]: value } : plan,
      ),
    );
  }

  async function savePlans(event) {
    event.preventDefault();
    setSavingPlans(true);
    setError("");
    try {
      const { data } = await api.put("/admin/sub-admin-subscription-plans", {
        plans: plans.map((plan) => ({
          key: plan.key,
          amount: Number(plan.amount),
          serviceLimit: Number(plan.serviceLimit),
          sessionLimit: Number(plan.sessionLimit),
        })),
      });
      setPlans(data.plans || []);
      onToast({
        type: "success",
        text: "Subscription plan settings saved.",
      });
    } catch (requestError) {
      onToast({
        type: "error",
        text:
          requestError.response?.data?.message ||
          "Could not save subscription plan settings.",
      });
    } finally {
      setSavingPlans(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const pendingPages = Math.max(1, Math.ceil(invitations.length / invitesPerPage));
  const activePages = Math.max(1, Math.ceil(subAdmins.length / invitesPerPage));
  const visibleInvitations = invitations.slice(
    (pendingPage - 1) * invitesPerPage,
    pendingPage * invitesPerPage,
  );
  const visibleSubAdmins = subAdmins.slice(
    (activePage - 1) * invitesPerPage,
    activePage * invitesPerPage,
  );
  const accountAppointments = accountServices.flatMap((service) =>
    service.appointments.map((appointment) => ({ service, appointment })),
  );
  const accountAppointmentPages = Math.max(
    1,
    Math.ceil(accountAppointments.length / appointmentsPerPage),
  );
  const visibleAccountAppointments = accountAppointments.slice(
    (accountAppointmentsPage - 1) * appointmentsPerPage,
    accountAppointmentsPage * appointmentsPerPage,
  );
  const confirmedAppointmentCount = accountAppointments.filter(
    ({ appointment }) => appointment.status === "booked",
  ).length;
  const confirmedEarnings = accountAppointments.reduce(
    (total, { service, appointment }) =>
      appointment.status === "booked" ? total + Number(service.price || 0) : total,
    0,
  );
  useEffect(() => {
    setPendingPage((current) => Math.min(current, pendingPages));
  }, [pendingPages]);
  useEffect(() => {
    setActivePage((current) => Math.min(current, activePages));
  }, [activePages]);
  useEffect(() => {
    setAccountAppointmentsPage((current) =>
      Math.min(current, accountAppointmentPages),
    );
  }, [accountAppointmentPages]);
  useEffect(() => {
    if (!selectedAccount) return undefined;
    let active = true;
    setAccountServices([]);
    setAccountAppointmentsPage(1);
    setAccountServicesLoading(true);
    setAccountServicesError("");
    api
      .get(`/admin/sub-admins/${selectedAccount._id}/appointments`)
      .then(({ data }) => {
        if (active) setAccountServices(data.services || []);
      })
      .catch((requestError) => {
        if (active)
          setAccountServicesError(
            requestError.response?.data?.message ||
              "Could not load this sub-admin's appointments.",
          );
      })
      .finally(() => {
        if (active) setAccountServicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedAccount]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/admin/sub-admin-invitations", { email, name });
      setEmail("");
      setName("");
      onToast({
        type: "success",
        text: "Invitation sent. The recipient can create an account after choosing and paying for a subscription.",
      });
      await load();
      setPendingPage(1);
    } catch (requestError) {
      onToast({
        type: "error",
        text:
          requestError.response?.data?.message || "Could not send invitation.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-services">
      <header className="admin-list-head">
        <div>
          <h2>Sub-admin access</h2>
          <p>Invite service managers. They choose a subscription plan before their account is activated.</p>
        </div>
      </header>
      {error && <p className="notice error" role="alert">{error}</p>}
      <nav className="admin-subadmin-actions" aria-label="Sub-admin management">
        <button
          type="button"
          aria-pressed={selectedView === "invite"}
          className={selectedView === "invite" ? "active" : ""}
          onClick={() => setSelectedView("invite")}
        >
          <MailPlus size={17} /> Send invite
        </button>
        <button
          type="button"
          aria-pressed={selectedView === "plans"}
          className={selectedView === "plans" ? "active" : ""}
          onClick={() => setSelectedView("plans")}
        >
          <Settings2 size={17} /> Subscription plans
        </button>
        <button
          type="button"
          aria-pressed={selectedView === "pending"}
          className={selectedView === "pending" ? "active" : ""}
          onClick={() => setSelectedView("pending")}
        >
          <Clock3 size={17} /> Pending invites <span>{invitations.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={selectedView === "active"}
          className={selectedView === "active" ? "active" : ""}
          onClick={() => setSelectedView("active")}
        >
          <UsersRound size={17} /> Active accounts <span>{subAdmins.length}</span>
        </button>
      </nav>
      {selectedView === "invite" && (
      <form className="admin-invite-panel" onSubmit={submit}>
        <div className="admin-subadmin-panel-heading">
          <span className="admin-subadmin-icon"><MailPlus size={21} /></span>
          <div>
            <h3>Send an invitation</h3>
            <p>Give a service manager secure access to their own workspace.</p>
          </div>
        </div>
        <div className="admin-invite-fields">
          <label>
            Name <span>Optional</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength="80"
              placeholder="e.g. Priya Sharma"
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength="254"
              placeholder="name@example.com"
              required
            />
          </label>
        </div>
        <div className="admin-invite-footer">
          <p><Clock3 size={15} /> Invite links are one-time use and expire after 24 hours.</p>
          <button className="btn btn-dark" disabled={busy}>
            <Send size={16} /> {busy ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
      )}

      {selectedView === "plans" && (
      <form className="admin-subscription-plan-editor" onSubmit={savePlans}>
        <div className="admin-subscription-plan-heading">
          <div className="admin-subadmin-panel-heading">
            <span className="admin-subadmin-icon"><Settings2 size={21} /></span>
            <div>
              <h3>Subscription plans</h3>
              <p>Set plan pricing, service allowance, and bookable time slots.</p>
            </div>
          </div>
          <button className="btn btn-dark" disabled={savingPlans || !plans.length}>
            {savingPlans ? "Saving…" : "Save plan settings"}
          </button>
        </div>
        <div className="admin-subscription-period-tabs" aria-label="Plan billing period">
          {["monthly", "quarterly", "yearly"].map((period) => (
            <button
              className={`admin-subscription-period-tab${selectedPeriod === period ? " active" : ""}`}
              key={period}
              type="button"
              onClick={() => setSelectedPeriod(period)}
            >
              {period[0].toUpperCase() + period.slice(1)}
            </button>
          ))}
        </div>
        {plans
          .filter((plan) => plan.key === selectedPeriod)
          .map((plan) => (
            <div className="admin-subscription-plan-fields" key={plan.key}>
              <div className="admin-subscription-plan-summary">
                <span className="eyebrow">{plan.name} PLAN</span>
                <p>
                  {plan.durationMonths === 1
                    ? "Renews every month"
                    : `Renews every ${plan.durationMonths} months`}
                </p>
              </div>
              <label>
                Price for this period (₹)
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  value={plan.amount}
                  onChange={(event) =>
                    updatePlan(plan.key, "amount", event.target.value)
                  }
                  required
                />
              </label>
              <label>
                Appointment services
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  value={plan.serviceLimit}
                  onChange={(event) =>
                    updatePlan(plan.key, "serviceLimit", event.target.value)
                  }
                  required
                />
              </label>
              <label>
                Bookable time slots
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  value={plan.sessionLimit}
                  onChange={(event) =>
                    updatePlan(plan.key, "sessionLimit", event.target.value)
                  }
                  required
                />
              </label>
            </div>
          ))}
      </form>
      )}

      {selectedView === "pending" && (
        <section className="admin-subadmin-accounts">
          <div className="admin-subadmin-account-list admin-subadmin-account-list-pending">
            {invitations.length ? visibleInvitations.map((invitation) => (
              <article className="admin-subadmin-account-card" key={invitation._id}>
                <span className="admin-subadmin-account-avatar"><MailPlus size={19} /></span>
                <div className="admin-subadmin-account-details">
                  <h4>{invitation.name || invitation.email}</h4>
                  {invitation.name && <p>{invitation.email}</p>}
                  <small>
                    Expires {new Date(invitation.expiresAt).toLocaleString(
                      undefined,
                      { dateStyle: "medium", timeStyle: "short" },
                    )}
                  </small>
                </div>
                <span className="admin-subadmin-status pending"><Clock3 size={14} /> Pending</span>
              </article>
            )) : (
              <p className="admin-subadmin-empty">No pending invitations right now.</p>
            )}
          </div>
          <ListPagination
            page={pendingPage}
            pages={pendingPages}
            total={invitations.length}
            onPageChange={setPendingPage}
            label="invitations"
          />
        </section>
      )}
      {selectedView === "active" && (
        <section className="admin-subadmin-accounts">
          {selectedAccount ? (
            <div className="admin-subadmin-account-appointments">
              <button
                type="button"
                className="btn btn-outline admin-subadmin-account-back"
                onClick={() => setSelectedAccount(null)}
              >
                <ArrowLeft size={16} /> Back to active accounts
              </button>
              <header className="admin-subadmin-appointments-heading">
                <div>
                  <h3>{selectedAccount.name}</h3>
                  <p>{selectedAccount.email}</p>
                </div>
                <span className={`admin-subadmin-status ${selectedAccount.active ? "active" : "disabled"}`}>
                  <BadgeCheck size={14} /> {selectedAccount.active ? "Active" : "Disabled"}
                </span>
              </header>
              <div className="admin-subadmin-appointments-toolbar">
                <h4 className="admin-subadmin-appointments-title">
                  Created appointments and bookings
                </h4>
                <div className="admin-subadmin-appointment-metrics">
                  <div>
                    <span>Confirmed appointments</span>
                    <strong>{confirmedAppointmentCount}</strong>
                  </div>
                  <div>
                    <span>Total earnings</span>
                    <strong>₹{confirmedEarnings.toFixed(2)}</strong>
                  </div>
                </div>
              </div>
              {accountServicesError && (
                <p className="notice error" role="alert">{accountServicesError}</p>
              )}
              {accountServicesLoading ? (
                <p className="loading-state">Loading appointments…</p>
              ) : accountAppointments.length ? (
                <div className="admin-subadmin-appointment-list">
                  {visibleAccountAppointments.map(({ service, appointment }) => (
                    <article
                      className="admin-subadmin-appointment-card"
                      key={`${service._id}-${appointment.slotId}`}
                    >
                      <div className="admin-subadmin-appointment-card-heading">
                        <div>
                          <span className="admin-subadmin-appointment-provider">
                            {service.instructorName}
                          </span>
                          <h4>{service.title}</h4>
                        </div>
                        <span className={`admin-subadmin-appointment-status ${appointment.status}`}>
                          {appointment.status === "booked"
                            ? "Confirmed booking"
                            : appointment.status === "pending_payment"
                              ? "Payment pending"
                              : "Available"}
                        </span>
                      </div>
                      <div className="admin-subadmin-appointment-card-details">
                        <span className="admin-subadmin-appointment-time">
                          <CalendarDays size={16} aria-hidden="true" />
                          {new Date(appointment.startsAt).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        <span>{service.durationMinutes} min</span>
                        <strong>₹{Number(service.price).toFixed(2)}</strong>
                      </div>
                      {service.description && (
                        <p className="admin-subadmin-appointment-description">
                          {service.description}
                        </p>
                      )}
                      {appointment.customer && (
                        <div className="admin-subadmin-appointment-customer">
                          <strong>{appointment.customer.name || "Customer"}</strong>
                          <span>
                            {[appointment.customer.email, appointment.customer.phone]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="admin-subadmin-empty">
                  This account has not created any appointments yet.
                </p>
              )}
              {!accountServicesLoading && accountAppointments.length > 0 && (
                <ListPagination
                  page={accountAppointmentsPage}
                  pages={accountAppointmentPages}
                  total={accountAppointments.length}
                  onPageChange={setAccountAppointmentsPage}
                  label="appointments"
                  alwaysShow
                />
              )}
            </div>
          ) : (
            <>
              <div className="admin-subadmin-account-list admin-subadmin-account-list-active">
                {subAdmins.length ? visibleSubAdmins.map((account) => (
                  <button
                    type="button"
                    className="admin-subadmin-account-card"
                    key={account._id}
                    onClick={() => setSelectedAccount(account)}
                    aria-label={`View appointments for ${account.name}`}
                  >
                    <span className="admin-subadmin-account-avatar"><UsersRound size={19} /></span>
                    <span className="admin-subadmin-account-details">
                      <strong>{account.name}</strong>
                      <span>{account.email}</span>
                      <span>
                        {account.subscription?.planName
                          ? `${account.subscription.planName} · ₹${account.subscription.amount}/${account.subscription.durationMonths === 12 ? "year" : account.subscription.durationMonths === 3 ? "quarter" : "month"} · ${account.subscription.status?.replace("_", " ") || "inactive"}`
                          : "No subscription plan"}
                      </span>
                      {account.subscription?.serviceLimit && (
                        <small>
                          Up to {account.subscription.serviceLimit} services · {account.subscription.sessionLimit || "Legacy"} bookable time slots
                        </small>
                      )}
                      {account.subscription?.currentPeriodEnd && (
                        <small>
                          Current period ends {new Date(account.subscription.currentPeriodEnd).toLocaleDateString()}
                        </small>
                      )}
                      <span className="admin-subadmin-account-open">View appointments <ChevronRight size={16} /></span>
                    </span>
                    <span className={`admin-subadmin-status ${account.active ? "active" : "disabled"}`}>
                      <BadgeCheck size={14} /> {account.active ? "Active" : "Disabled"}
                    </span>
                  </button>
                )) : (
                  <p className="admin-subadmin-empty">No sub-admin accounts yet.</p>
                )}
              </div>
              <ListPagination
                page={activePage}
                pages={activePages}
                total={subAdmins.length}
                onPageChange={setActivePage}
                label="accounts"
              />
            </>
          )}
        </section>
      )}
    </section>
  );
}
