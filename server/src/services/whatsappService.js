import AppError from "../utils/AppError.js";

export async function sendWhatsAppTemplate({
  phone,
  templateName,
  parameters,
}) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken || !templateName)
    throw new AppError(
      "WhatsApp Business API is not configured. Set its server environment values and approved template names.",
      503,
      "WHATSAPP_NOT_CONFIGURED",
    );
  const version = process.env.WHATSAPP_API_VERSION || "v22.0";
  const digits = String(phone).replace(/[^0-9]/g, "");
  const recipient = digits.length === 10 ? `91${digits}` : digits;
  const response = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
          },
          components: [
            {
              type: "body",
              parameters: parameters.map((text) => ({
                type: "text",
                text: String(text).slice(0, 1024),
              })),
            },
          ],
        },
      }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AppError(
      result.error?.message || "WhatsApp Business API rejected the message",
      502,
      "WHATSAPP_SEND_FAILED",
    );
  return String(result.messages?.[0]?.id || "");
}

export async function sendOrderWhatsApp(orderId, { retry = false } = {}) {
  const { default: Order } = await import("../models/Order.js");
  const { default: User } = await import("../models/User.js");
  const order = await Order.findById(orderId);
  if (!order) return;
  const currentStatus = order.whatsapp?.status || "not_requested";
  if (
    !["not_requested", ...(retry ? ["failed"] : [])].includes(currentStatus)
  )
    return;
  const user = await User.findById(order.user).select("whatsappOptIn");
  if (!user?.whatsappOptIn || !order.shippingAddress?.phone) return;
  const claimed = await Order.updateOne(
    { _id: order._id, "whatsapp.status": currentStatus },
    { $set: { "whatsapp.status": "sending", "whatsapp.error": "" } },
  );
  if (!claimed.modifiedCount) return;
  try {
    const messageId = await sendWhatsAppTemplate({
      phone: order.shippingAddress.phone,
      templateName: process.env.WHATSAPP_ORDER_TEMPLATE,
      parameters: [
        String(order._id).slice(-8).toUpperCase(),
        order.items.map((item) => `${item.name} x${item.quantity}`).join(", "),
        order.total.toFixed(2),
      ],
    });
    await Order.updateOne(
      { _id: order._id, "whatsapp.status": "sending" },
      {
        $set: {
          "whatsapp.status": "sent",
          "whatsapp.messageId": messageId,
          "whatsapp.sentAt": new Date(),
        },
      },
    );
  } catch (error) {
    await Order.updateOne(
      { _id: order._id, "whatsapp.status": "sending" },
      {
        $set: {
          "whatsapp.status": "failed",
          "whatsapp.error": error.message.slice(0, 300),
        },
      },
    );
    console.error("WhatsApp order notification failed", {
      orderId: String(order._id),
      code: error.code || "WHATSAPP_SEND_FAILED",
    });
    return "failed";
  }
  return "sent";
}

export async function sendClassWhatsApp(sessionId, paymentOrderId) {
  const { default: ClassSession } = await import("../models/ClassSession.js");
  const { default: User } = await import("../models/User.js");
  const session = await ClassSession.findById(sessionId).select(
    "title startsAt price seats",
  );
  const seats =
    session?.seats.filter(
      (seat) =>
        seat.paymentOrderId === paymentOrderId && seat.status === "booked",
    ) || [];
  if (
    !session ||
    !seats.length ||
    (seats[0].whatsapp?.status || "not_requested") !== "not_requested"
  )
    return;
  const user = await User.findById(seats[0].bookedBy).select(
    "phone whatsappOptIn",
  );
  if (!user?.whatsappOptIn || !user.phone) return;
  const claim = await ClassSession.updateOne(
    {
      _id: sessionId,
      seats: {
        $elemMatch: {
          paymentOrderId,
          status: "booked",
          "whatsapp.status": "not_requested",
        },
      },
    },
    {
      $set: {
        "seats.$[seat].whatsapp.status": "sending",
        "seats.$[seat].whatsapp.error": "",
      },
    },
    { arrayFilters: [{ "seat.paymentOrderId": paymentOrderId }] },
  );
  if (!claim.modifiedCount) return;
  try {
    const messageId = await sendWhatsAppTemplate({
      phone: user.phone,
      templateName: process.env.WHATSAPP_CLASS_TEMPLATE,
      parameters: [
        session.title,
        seats.map((seat) => seat.seatNumber).join(", "),
        new Date(session.startsAt).toLocaleString("en-IN"),
        (session.price * seats.length).toFixed(2),
      ],
    });
    await ClassSession.updateOne(
      { _id: sessionId },
      {
        $set: {
          "seats.$[seat].whatsapp.status": "sent",
          "seats.$[seat].whatsapp.messageId": messageId,
          "seats.$[seat].whatsapp.sentAt": new Date(),
        },
      },
      { arrayFilters: [{ "seat.paymentOrderId": paymentOrderId }] },
    );
  } catch (error) {
    await ClassSession.updateOne(
      { _id: sessionId },
      {
        $set: {
          "seats.$[seat].whatsapp.status": "failed",
          "seats.$[seat].whatsapp.error": error.message.slice(0, 300),
        },
      },
      { arrayFilters: [{ "seat.paymentOrderId": paymentOrderId }] },
    );
    console.error("WhatsApp class notification failed", {
      paymentOrderId,
      code: error.code || "WHATSAPP_SEND_FAILED",
    });
  }
}
