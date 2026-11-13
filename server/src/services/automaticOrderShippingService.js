import Order from "../models/Order.js";
import {
  getShippingAutomationConfig,
  selectShiprocketCourier,
} from "../config/shipping.js";
import {
  assignShiprocketCourier,
  createShiprocketOrder,
  generateShiprocketLabel,
  getShiprocketCouriers,
} from "./shiprocketService.js";
import { calculateShippingPackage } from "../utils/shippingPackage.js";

async function requireManualFulfillment(order, message) {
  await Order.updateOne(
    { _id: order._id, "shipping.autoBookingStatus": "processing" },
    {
      $set: {
        "shipping.autoBookingStatus": "manual_required",
        "shipping.autoBookingError": message,
      },
    },
  );
  return false;
}

export async function automatePaidOrderShipping(orderId) {
  if (process.env.SHIPROCKET_AUTO_BOOK_PAID_ORDERS !== "true") return false;

  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: "paid",
      status: { $in: ["paid", "processing"] },
      cancellationProcessing: { $ne: true },
      $or: [
        { "shipping.autoBookingStatus": "not_started" },
        { "shipping.autoBookingStatus": null },
      ],
    },
    {
      $set: {
        "shipping.autoBookingStatus": "processing",
        "shipping.autoBookingError": "",
        "shipping.autoBookingStartedAt": new Date(),
      },
    },
    { new: true },
  ).populate("user", "email");
  if (!order) return false;

  try {
    const config = getShippingAutomationConfig();
    const itemCount = order.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    if (itemCount > config.maxAutomaticItems) {
      return await requireManualFulfillment(
        order,
        `Order contains ${itemCount} items, above the automatic booking limit of ${config.maxAutomaticItems}. ` +
          "Confirm the actual parcel dimensions and complete shipping manually.",
      );
    }
    const missingWeights = order.items.filter(
      (item) =>
        !Number.isFinite(item.shippingWeightKg) || item.shippingWeightKg <= 0,
    );
    if (missingWeights.length)
      throw new Error(
        `Add shipping weight for ${missingWeights.map((item) => item.name).join(", ")} before automatic shipment booking.`,
      );
    const hasMissingDimensions = order.items.some(
      (item) =>
        !Number.isFinite(item.shippingLengthCm) ||
        item.shippingLengthCm <= 0 ||
        !Number.isFinite(item.shippingBreadthCm) ||
        item.shippingBreadthCm <= 0 ||
        !Number.isFinite(item.shippingHeightCm) ||
        item.shippingHeightCm <= 0,
    );
    if (hasMissingDimensions)
      return await requireManualFulfillment(
        order,
        "Product dimensions are missing. Enter the actual parcel dimensions and weight in the manual shipping fields below.",
      );
    const packageData = calculateShippingPackage(order.items);
    const couriers = await getShiprocketCouriers({
      deliveryPostalCode: order.shippingAddress.postalCode,
      weight: packageData.weight,
      declaredValue: order.total,
    });
    const selectedCourierId = Number(order.shipping?.selectedCourierId);
    const courier = selectedCourierId
      ? couriers.find(
          (available) =>
            Number(available.courier_company_id) === selectedCourierId,
        )
      : selectShiprocketCourier(couriers, config.courierSelection);
    if (selectedCourierId && !courier)
      throw new Error(
        "The courier selected during checkout is no longer available. Complete shipping manually in Admin.",
      );
    if (
      selectedCourierId &&
      Math.abs(Number(courier.rate) - order.shippingCost) > 0.01
    )
      throw new Error(
        "The selected courier price changed after checkout. Review shipping manually in Admin before booking.",
      );
    const courierId = Number(courier?.courier_company_id);
    if (!courier || !Number.isInteger(courierId) || courierId < 1)
      throw new Error("No suitable Shiprocket courier is available for this order.");

    order.shipping ||= {};
    order.tracking ||= {};
    order.shipping.package = packageData;
    order.shipping.selectedCourierId = courierId;
    order.shipping.selectedCourierName = courier.courier_name || "Shiprocket";
    order.shipping.quotedRate = order.shippingCost || 0;
    order.shipping.estimatedDays = String(
      courier.estimated_delivery_days || "",
    );
    order.tracking.courier = courier.courier_name || "Shiprocket";

    if (!order.shipping.shiprocketOrderId) {
      const created = await createShiprocketOrder(order, packageData);
      const shipmentId = created.shipment_id || created.shipments?.[0]?.id;
      if (!created.order_id || !shipmentId)
        throw new Error("Shiprocket created no shipment details.");
      order.shipping.shiprocketOrderId = String(created.order_id);
      order.shipping.shipmentId = String(shipmentId);
      await order.save();
    }

    if (!order.tracking.trackingNumber) {
      const awb = await assignShiprocketCourier(
        order.shipping.shipmentId,
        courierId,
      );
      const assigned = awb;
      order.tracking.courier =
        assigned.courier_name ||
        assigned.courier_company_name ||
        courier.courier_name ||
        "Shiprocket";
      order.tracking.trackingNumber = String(assigned.awb_code);
      await order.save();
    }

    if (!order.shipping.labelUrl) {
      const label = await generateShiprocketLabel(order.shipping.shipmentId);
      const labelUrl = label.label_url || label.response?.label_url;
      if (!labelUrl)
        throw new Error(label.message || "Shiprocket did not return a shipping label.");
      order.shipping.labelUrl = String(labelUrl);
    }

    if (order.status === "paid") {
      order.status = "processing";
      order.statusHistory.push({
        status: "processing",
        note: "Shiprocket shipment booked; awaiting parcel packing and courier pickup.",
      });
    }
    order.shipping.autoBookingStatus = "booked";
    order.shipping.autoBookingError = "";
    await order.save();
    return true;
  } catch (error) {
    await Order.updateOne(
      { _id: order._id, "shipping.autoBookingStatus": "processing" },
      {
        $set: {
          "shipping.autoBookingStatus": "failed",
          "shipping.autoBookingError": String(
            error.message || "Automatic shipment booking failed.",
          ).slice(0, 500),
        },
      },
    );
    console.error("Automatic Shiprocket booking failed", {
      orderId: String(order._id),
      message: error.message,
    });
    return false;
  }
}
