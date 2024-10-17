const mongoose = require("mongoose");

const CartSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  items: { type: [mongoose.Mixed], required: true },
  user: {
    type: mongoose.Mixed,
    required: true,
  },
  type: { type: String },
  amountToBePaid: { type: Number, default: 0 },
  title: { type: String },
  description: { type: String },
  thumbnail: { type: String },
  data: { type: mongoose.Mixed },
  tags: { type: mongoose.Mixed },
  hideQuantity: { type: mongoose.Mixed },
});

const Cart = mongoose.model("Cart", CartSchema);

module.exports = { Cart };
