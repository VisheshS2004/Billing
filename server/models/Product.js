const mongoose = require('mongoose');

const VALID_UNITS = [
  'kg', 'gm', 'litre', 'ml',
  'piece', 'packet', 'dozen', 'box',
  'katta',   // large sack (50kg bag)
  'patty',   // small retail pack / strip
  'carton', 'bottle', 'tin', 'bag',
  'ladi', 'set', 'teen',
  'M', 'cane'
];

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a product name'],
    trim: true,
  },
  unit: {
    type: String,
    required: [true, 'Please specify a unit'],
    enum: {
      values: VALID_UNITS,
      message: '{VALUE} is not a valid unit',
    },
  },
  priceRetail: {
    type: Number,
    required: [true, 'Please add a retail price'],
    min: [0, 'Price cannot be negative'],
  },
  priceWholesale: {
    type: Number,
    required: [true, 'Please add a wholesale price'],
    min: [0, 'Price cannot be negative'],
  },
  pricePurchase: {
    type: Number,
    default: 0,
    min: [0, 'Price cannot be negative'],
  },
  mrp: {
    type: Number,
    default: null,   // null = no MRP printed on this item
  },
  quality: {
    type: String,
    enum: ['I', 'II', ''],
    default: ''
  },
  packetSize: {
    type: String,
    trim: true,
    default: ''
  },
}, {
  timestamps: true,
});

// ── Composite unique index ──────────────────────────────────────────────────
// A product is unique when name + unit + mrp + quality + packetSize are ALL the same.
productSchema.index({ name: 1, unit: 1, mrp: 1, quality: 1, packetSize: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);
module.exports.VALID_UNITS = VALID_UNITS;
