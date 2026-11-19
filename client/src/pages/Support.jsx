import { Mail, MessageCircle, Package, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo";

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
const supportPhone = import.meta.env.VITE_SUPPORT_PHONE?.trim();
const supportWhatsApp = import.meta.env.VITE_SUPPORT_WHATSAPP?.replace(
  /\D/g,
  "",
);

export default function Support() {
  const contacts = [
    {
      label: "WhatsApp",
      value: supportWhatsApp,
      href: supportWhatsApp
        ? `https://wa.me/${supportWhatsApp}`
        : "",
      icon: MessageCircle,
    },
    {
      label: "Email",
      value: supportEmail,
      href: supportEmail ? `mailto:${supportEmail}` : "",
      icon: Mail,
    },
    {
      label: "Phone",
      value: supportPhone,
      href: supportPhone ? `tel:${supportPhone.replace(/[^\d+]/g, "")}` : "",
      icon: Phone,
    },
  ];
  const configuredContacts = contacts.filter((contact) => contact.value);

  return (
    <section className="section support-page">
      <Seo
        title="Customer Support"
        description="Contact Divine Vikas for help with fragrance products, orders, payments, class bookings, and appointments."
      />
      <div className="shop-intro">
        <span className="eyebrow">WE’RE HERE TO HELP</span>
        <h1>
          Customer <em>support.</em>
        </h1>
        <p>
          Get help with orders, payments, products, class bookings, or any other
          question.
        </p>
      </div>
      <div className="support-card">
        <div className="support-card-heading">
          <Package size={22} />
          <div>
            <h2>How can we help?</h2>
            <p>
              For order questions, include your order number. For payment or
              booking questions, include the date and a short description. Never
              share your password or payment PIN.
            </p>
          </div>
        </div>
        {configuredContacts.length ? (
          <div className="support-contact-list">
            {configuredContacts.map(({ label, value, href, icon: Icon }) => (
              <a
                className="support-contact"
                href={href}
                key={label}
                target={label === "WhatsApp" ? "_blank" : undefined}
                rel={label === "WhatsApp" ? "noreferrer" : undefined}
              >
                <Icon size={20} />
                <span>
                  <b>{label}</b>
                  <small>{value}</small>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="support-not-configured">
            Support contact details are being set up. Please check back soon.
          </p>
        )}
        <Link className="text-link support-orders-link" to="/orders">
          View your orders
        </Link>
      </div>
    </section>
  );
}
