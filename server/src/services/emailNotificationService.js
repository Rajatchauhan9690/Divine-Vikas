import Order from "../models/Order.js";
import ClassSession from "../models/ClassSession.js";
import User from "../models/User.js";
import {
  sendClassBookingConfirmationEmail,
  sendOrderConfirmationEmail,
} from "./emailService.js";

export async function notifyOrderConfirmation(orderId) {
  const order = await Order.findById(orderId);
  if (!order) return;

  const claimed = await Order.updateOne(
    {
      _id: order._id,
      "emailNotification.status": { $in: ["not_requested", null] },
    },
    {
      $set: {
        "emailNotification.status": "sending",
        "emailNotification.error": "",
      },
    },
  );
  if (!claimed.modifiedCount) return;

  try {
    const user = await User.findById(order.user).select("email");
    if (!user?.email) throw new Error("Order customer email is unavailable");
    await sendOrderConfirmationEmail({
      email: user.email,
      orderId: order._id,
      items: order.items,
      total: order.total,
    });
    await Order.updateOne(
      { _id: order._id, "emailNotification.status": "sending" },
      {
        $set: {
          "emailNotification.status": "sent",
          "emailNotification.sentAt": new Date(),
        },
      },
    );
  } catch (error) {
    await Order.updateOne(
      { _id: order._id, "emailNotification.status": "sending" },
      {
        $set: {
          "emailNotification.status": "failed",
          "emailNotification.error": String(error.message).slice(0, 300),
        },
      },
    );
    console.error("Order confirmation email failed", {
      orderId: String(order._id),
      code: error.code || "EMAIL_SEND_FAILED",
    });
  }
}

export async function notifyClassBookingConfirmation(sessionId, paymentOrderId) {
  const session = await ClassSession.findById(sessionId).select(
    "title startsAt price seats",
  );
  const seats =
    session?.seats.filter(
      (seat) =>
        seat.paymentOrderId === paymentOrderId && seat.status === "booked",
    ) || [];
  if (!session || !seats.length) return;

  const claimed = await ClassSession.updateOne(
    {
      _id: sessionId,
      seats: {
        $elemMatch: {
          paymentOrderId,
          status: "booked",
          "emailNotification.status": { $in: ["not_requested", null] },
        },
      },
    },
    {
      $set: {
        "seats.$[seat].emailNotification.status": "sending",
        "seats.$[seat].emailNotification.error": "",
      },
    },
    {
      arrayFilters: [
        {
          "seat.paymentOrderId": paymentOrderId,
          "seat.status": "booked",
          "seat.emailNotification.status": { $in: ["not_requested", null] },
        },
      ],
    },
  );
  if (!claimed.modifiedCount) return;

  try {
    const user = await User.findById(seats[0].bookedBy).select("email");
    if (!user?.email) throw new Error("Booking customer email is unavailable");
    await sendClassBookingConfirmationEmail({
      email: user.email,
      classTitle: session.title,
      seatNumbers: seats.map((seat) => seat.seatNumber),
      startsAt: session.startsAt,
      total: session.price * seats.length,
    });
    await ClassSession.updateOne(
      { _id: sessionId },
      {
        $set: {
          "seats.$[seat].emailNotification.status": "sent",
          "seats.$[seat].emailNotification.sentAt": new Date(),
        },
      },
      { arrayFilters: [{ "seat.paymentOrderId": paymentOrderId }] },
    );
  } catch (error) {
    await ClassSession.updateOne(
      { _id: sessionId },
      {
        $set: {
          "seats.$[seat].emailNotification.status": "failed",
          "seats.$[seat].emailNotification.error": String(error.message).slice(
            0,
            300,
          ),
        },
      },
      { arrayFilters: [{ "seat.paymentOrderId": paymentOrderId }] },
    );
    console.error("Class booking confirmation email failed", {
      paymentOrderId,
      code: error.code || "EMAIL_SEND_FAILED",
    });
  }
}
