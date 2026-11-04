import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: ["customer", "sub_admin", "admin"],
      default: "customer",
    },
    phone: { type: String, trim: true, maxlength: 20, default: "" },
    addresses: [
      {
        label: { type: String, trim: true, maxlength: 40, default: "Home" },
        fullName: { type: String, trim: true, required: true, maxlength: 100 },
        phone: { type: String, trim: true, required: true, maxlength: 20 },
        line1: { type: String, trim: true, required: true, maxlength: 180 },
        line2: { type: String, trim: true, maxlength: 180, default: "" },
        city: { type: String, trim: true, required: true, maxlength: 80 },
        state: { type: String, trim: true, required: true, maxlength: 80 },
        postalCode: { type: String, trim: true, required: true, maxlength: 12 },
        country: { type: String, trim: true, default: "India" },
        landmark: { type: String, trim: true, maxlength: 100, default: "" },
        isDefault: { type: Boolean, default: false },
      },
    ],
    active: { type: Boolean, default: true },
    subscription: {
      planKey: { type: String, default: "" },
      planName: { type: String, default: "" },
      amount: { type: Number, default: 0 },
      serviceLimit: { type: Number, default: 0 },
      sessionLimit: { type: Number, default: 0 },
      durationMonths: { type: Number, enum: [1, 3, 12], default: 1 },
      billingMode: {
        type: String,
        enum: ["manual", "autopay", ""],
        default: "",
      },
      status: {
        type: String,
        enum: ["inactive", "active", "past_due", "cancelled"],
        default: "inactive",
      },
      currentPeriodEnd: { type: Date, default: null },
      providerSubscriptionId: { type: String, default: "" },
      paymentAttemptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubAdminSubscriptionPayment",
        default: null,
      },
      lastPaymentId: { type: String, default: "" },
    },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

userSchema.pre("save", async function () {
  if (this.isModified("password") && !this.$locals.passwordHashed)
    this.password = await bcrypt.hash(this.password, 12);
});
userSchema.statics.createWithPasswordHash = async function (values) {
  const user = new this(values);
  user.$locals.passwordHashed = true;
  await user.save();
  return user;
};
userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    delete ret.__v;
    return ret;
  },
});
export default mongoose.model("User", userSchema);
