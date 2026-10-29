import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxLength: 120 },
    slug: { type: String, unique: true, index: true },
    price: { type: Number, required: true, min: 1 },
    category: {
      type: String,
      enum: ["Devoted to god", "Mood uplifters", "Other"],
      default: "Devoted to god",
    },
    shortDescription: { type: String, default: "", maxLength: 180 },
    description: { type: String, default: "", maxLength: 3000 },
    image: { type: String, default: "" },
    stock: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 4.8, min: 0, max: 5 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
schema.pre("validate", function () {
  if (this.isModified("name") || !this.slug)
    this.slug =
      this.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      Math.random().toString(36).slice(2, 7);
});
export default mongoose.model("Product", schema);
