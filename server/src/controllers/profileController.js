import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const fields = [
  "label",
  "fullName",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "postalCode",
  "country",
  "landmark",
];
function cleanAddress(input = {}) {
  const out = {};
  for (const key of fields)
    if (input[key] !== undefined)
      out[key] =
        typeof input[key] === "string" ? input[key].trim() : input[key];
  if (
    !out.fullName ||
    !out.phone ||
    !out.line1 ||
    !out.city ||
    !out.state ||
    !out.postalCode
  )
    throw new AppError(
      "Name, phone, address, city, state and postal code are required",
      400,
      "INVALID_ADDRESS",
    );
  if (!/^\+?[0-9 ()-]{8,20}$/.test(out.phone))
    throw new AppError("Enter a valid phone number", 400, "INVALID_ADDRESS");
  out.country = out.country || "India";
  return out;
}
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    success: true,
    profile: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      addresses: user.addresses,
    },
  });
});
export const updateProfile = asyncHandler(async (req, res) => {
  const allowed = {};
  if (typeof req.body.name === "string" && req.body.name.trim())
    allowed.name = req.body.name.trim().slice(0, 80);
  if (req.body.phone !== undefined)
    allowed.phone = String(req.body.phone).trim().slice(0, 20);
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: allowed },
    { new: true, runValidators: true },
  );
  res.json({
    success: true,
    profile: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      addresses: user.addresses,
    },
  });
});
export const addAddress = asyncHandler(async (req, res) => {
  const address = cleanAddress(req.body);
  const user = await User.findById(req.user._id);
  if (user.addresses.length >= 10)
    throw new AppError("You can save up to 10 addresses", 400, "ADDRESS_LIMIT");
  address.isDefault =
    Boolean(req.body.isDefault) || user.addresses.length === 0;
  if (address.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  user.addresses.push(address);
  await user.save();
  res.status(201).json({ success: true, addresses: user.addresses });
});
export const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address)
    throw new AppError("Address not found", 404, "ADDRESS_NOT_FOUND");
  const next = cleanAddress({ ...address.toObject(), ...req.body });
  for (const k of fields) address[k] = next[k];
  if (req.body.isDefault) {
    user.addresses.forEach((a) => (a.isDefault = false));
    address.isDefault = true;
  }
  await user.save();
  res.json({ success: true, addresses: user.addresses });
});
export const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address)
    throw new AppError("Address not found", 404, "ADDRESS_NOT_FOUND");
  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
  await user.save();
  res.json({ success: true, addresses: user.addresses });
});
export const setDefaultAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address)
    throw new AppError("Address not found", 404, "ADDRESS_NOT_FOUND");
  user.addresses.forEach((a) => (a.isDefault = a._id.equals(address._id)));
  await user.save();
  res.json({ success: true, addresses: user.addresses });
});
