import nodemailer from "nodemailer";
import AppError from "../utils/AppError.js";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !from || Boolean(user) !== Boolean(password))
    throw new AppError(
      "Email delivery is not configured. Set the SMTP server values.",
      503,
      "EMAIL_NOT_CONFIGURED",
    );

  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      ...(user ? { auth: { user, pass: password } } : {}),
    }),
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function renderConfirmationEmail({
  preheader,
  eyebrow = "CONFIRMATION",
  title,
  subtitle,
  content,
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f3ed;font-family:Arial,Helvetica,sans-serif;color:#252923">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f3ed">
      <tr>
        <td align="center" style="padding:36px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e8e5dc;border-radius:12px;overflow:hidden">
            <tr>
              <td style="padding:24px 32px;background-color:#123f32">
                <p style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:bold;letter-spacing:1px">DIVINE VIKAS</p>
                <p style="margin:6px 0 0;color:#e8c783;font-size:10px;font-weight:bold;letter-spacing:2px">FRAGRANCE OF DEVOTION</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                <p style="margin:0 0 10px;color:#8a6425;font-size:11px;font-weight:bold;letter-spacing:2px">${escapeHtml(eyebrow)}</p>
                <h1 style="margin:0;color:#1c2c25;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:normal;line-height:1.25">${escapeHtml(title)}</h1>
                <p style="margin:12px 0 24px;color:#69736a;font-size:15px;line-height:1.6">${escapeHtml(subtitle)}</p>
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background-color:#fbf9f4;border-top:1px solid #eeece6">
                <p style="margin:0;color:#777b73;font-size:12px;line-height:1.6">This is an automated message from Divine Vikas. If you have questions, please contact customer support. Please do not reply to this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendPasswordResetEmail(email, otp) {
  const { from, transport } = createTransport();
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background-color:#f5f3ed;border:1px solid #e8e5dc;border-radius:8px">
    <tr>
      <td align="center" style="padding:24px 16px">
        <p style="margin:0 0 10px;color:#777b73;font-size:10px;font-weight:bold;letter-spacing:1.5px">YOUR ONE-TIME CODE</p>
        <p style="margin:0;color:#123f32;font-size:34px;font-weight:bold;letter-spacing:9px">${escapeHtml(otp)}</p>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 20px;color:#59645b;font-size:13px;line-height:1.6">Enter this code on the password reset page. It expires in <strong style="color:#252923">10 minutes</strong> and can only be used once.</p>
  <p style="margin:0;padding:16px;border-left:3px solid #b9852d;background-color:#fbf9f4;color:#59645b;font-size:13px;line-height:1.6">If you didn’t request a password reset, you can safely ignore this email. Your password will not change.</p>`;

  await transport.sendMail({
    from,
    to: email,
    subject: "Your Divine Vikas password reset code",
    text: [
      "DIVINE VIKAS",
      "",
      "Reset your password",
      "",
      `Your password reset code is ${otp}.`,
      "",
      "Enter this code on the password reset page. It expires in 10 minutes.",
      "If you did not request this code, you can ignore this email.",
      "",
      "Divine Vikas",
    ].join("\n"),
    html: renderConfirmationEmail({
      preheader: "Your password reset code expires in 10 minutes.",
      eyebrow: "ACCOUNT SECURITY",
      title: "Reset your password",
      subtitle: "Use the secure code below to get back into your account.",
      content,
    }),
  });
}

export async function sendSubAdminInvitationEmail({ email, name, link }) {
  const { from, transport } = createTransport();
  const greeting = name ? `Hello ${escapeHtml(name)},` : "Hello,";
  const content = `<p style="margin:0 0 20px;color:#59645b;font-size:14px;line-height:1.6">${greeting} an administrator has invited you to manage appointment services on Divine Vikas.</p>
  <p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 20px;border-radius:6px;background-color:#123f32;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">Accept invitation</a></p>
  <p style="margin:0;color:#777b73;font-size:12px;line-height:1.6">This one-time link expires in 24 hours. If you weren’t expecting this invitation, you can ignore this email.</p>`;
  await transport.sendMail({
    from,
    to: email,
    subject: "You’re invited to Divine Vikas",
    text: [
      "DIVINE VIKAS",
      "",
      name ? `Hello ${name},` : "Hello,",
      "An administrator has invited you to manage appointment services.",
      "",
      `Accept your invitation: ${link}`,
      "",
      "This one-time link expires in 24 hours.",
    ].join("\n"),
    html: renderConfirmationEmail({
      preheader: "Accept your invitation to manage appointment services.",
      eyebrow: "ADMINISTRATOR INVITATION",
      title: "You’re invited",
      subtitle: "Create your account to start managing appointment services.",
      content,
    }),
  });
}

export async function sendOrderConfirmationEmail({
  email,
  orderId,
  items,
  total,
}) {
  const { from, transport } = createTransport();
  const orderNumber = String(orderId).slice(-8).toUpperCase();
  const text = [
    "DIVINE VIKAS",
    "",
    "Your order is confirmed",
    `Order #${orderNumber}`,
    "",
    ...items.map(
      (item) =>
        `${item.name} x${item.quantity} — ₹${(item.price * item.quantity).toFixed(2)}`,
    ),
    "",
    `Order total: ₹${Number(total).toFixed(2)}`,
    "",
    "Thank you for shopping with Divine Vikas.",
  ].join("\n");
  const htmlItems = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:14px 0;border-bottom:1px solid #eeece6">
            <p style="margin:0;color:#252923;font-size:14px;font-weight:bold;line-height:1.5">${escapeHtml(item.name)}</p>
            <p style="margin:4px 0 0;color:#777b73;font-size:12px">Quantity: ${item.quantity}</p>
          </td>
          <td align="right" style="padding:14px 0;border-bottom:1px solid #eeece6;color:#252923;font-size:14px;font-weight:bold;white-space:nowrap">₹${(item.price * item.quantity).toFixed(2)}</td>
        </tr>`,
    )
    .join("");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background-color:#f5f3ed;border-radius:8px">
    <tr>
      <td style="padding:16px">
        <p style="margin:0 0 5px;color:#777b73;font-size:10px;font-weight:bold;letter-spacing:1.5px">ORDER NUMBER</p>
        <p style="margin:0;color:#1c2c25;font-size:18px;font-weight:bold">#${orderNumber}</p>
      </td>
      <td align="right" style="padding:16px">
        <span style="display:inline-block;padding:7px 10px;border-radius:20px;background-color:#e5efe7;color:#315e44;font-size:10px;font-weight:bold;letter-spacing:1px">PAID</span>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 8px;color:#8a6425;font-size:10px;font-weight:bold;letter-spacing:1.5px">ORDER SUMMARY</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    ${htmlItems}
    <tr>
      <td style="padding:18px 0 0;color:#252923;font-size:15px;font-weight:bold">Total paid</td>
      <td align="right" style="padding:18px 0 0;color:#123f32;font-size:20px;font-weight:bold;white-space:nowrap">₹${Number(total).toFixed(2)}</td>
    </tr>
  </table>
  <p style="margin:24px 0 0;padding:16px;border-left:3px solid #b9852d;background-color:#fbf9f4;color:#59645b;font-size:13px;line-height:1.6">Thank you for choosing Divine Vikas. We’ll keep you updated as your order makes its way to you.</p>`;

  await transport.sendMail({
    from,
    to: email,
    subject: `Order #${orderNumber} confirmed — Divine Vikas`,
    text,
    html: renderConfirmationEmail({
      preheader: `Order #${orderNumber} is confirmed. Your order total is ₹${Number(total).toFixed(2)}.`,
      title: "Your order is confirmed",
      subtitle: "Thank you for your purchase. Your payment has been received.",
      content,
    }),
  });
}

export async function sendClassBookingConfirmationEmail({
  email,
  classTitle,
  seatNumbers,
  startsAt,
  total,
  appointment = false,
}) {
  const { from, transport } = createTransport();
  const safeTitle = escapeHtml(classTitle);
  const subjectTitle = String(classTitle).replace(/[\r\n]+/g, " ").slice(0, 120);
  const seatList = seatNumbers.join(", ");
  const startLabel = new Date(startsAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  const text = [
    "DIVINE VIKAS",
    "",
    appointment ? "Your appointment is confirmed" : "Your class booking is confirmed",
    classTitle,
    ...(appointment ? [] : [`Seats: ${seatList}`]),
    `Date and time: ${startLabel} (IST)`,
    `Total paid: ₹${Number(total).toFixed(2)}`,
    "",
    "We look forward to seeing you.",
  ].join("\n");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background-color:#f5f3ed;border-radius:8px">
    <tr>
      <td style="padding:18px">
        <p style="margin:0 0 7px;color:#777b73;font-size:10px;font-weight:bold;letter-spacing:1.5px">YOUR SESSION</p>
        <p style="margin:0;color:#1c2c25;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.35">${safeTitle}</p>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 8px;color:#8a6425;font-size:10px;font-weight:bold;letter-spacing:1.5px">BOOKING DETAILS</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eeece6;color:#777b73;font-size:13px">Date &amp; time</td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid #eeece6;color:#252923;font-size:13px;font-weight:bold">${escapeHtml(startLabel)} IST</td>
    </tr>
    ${appointment ? "" : `<tr>
      <td style="padding:12px 0;border-bottom:1px solid #eeece6;color:#777b73;font-size:13px">Seats</td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid #eeece6;color:#252923;font-size:13px;font-weight:bold">${escapeHtml(seatList)}</td>
    </tr>`}
    <tr>
      <td style="padding:18px 0 0;color:#252923;font-size:15px;font-weight:bold">Total paid</td>
      <td align="right" style="padding:18px 0 0;color:#123f32;font-size:20px;font-weight:bold;white-space:nowrap">₹${Number(total).toFixed(2)}</td>
    </tr>
  </table>
  <p style="margin:24px 0 0;padding:16px;border-left:3px solid #b9852d;background-color:#fbf9f4;color:#59645b;font-size:13px;line-height:1.6">${appointment ? "Your appointment time is reserved." : `Your seat${seatNumbers.length === 1 ? " is" : "s are"} reserved.`} We look forward to welcoming you.</p>`;

  await transport.sendMail({
    from,
    to: email,
    subject: `${appointment ? "Appointment" : "Class booking"} confirmed — ${subjectTitle}`,
    text,
    html: renderConfirmationEmail({
      preheader: `Your ${appointment ? "appointment" : "booking"} for ${classTitle} is confirmed.`,
      title: appointment ? "Your appointment is confirmed" : "Your booking is confirmed",
      subtitle: "Your payment is complete and your place is reserved.",
      content,
    }),
  });
}