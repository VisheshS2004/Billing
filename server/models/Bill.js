const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  customerName: {
    type: String,
    trim: true,
    default: 'Cash'
  },
  priceType: {
    type: String,
    enum: ['retail', 'wholesale'],
    default: 'retail'
  },
  items: [
    {
      _id: { type: String, required: true },
      name: { type: String, required: true },
      unit: { type: String, default: '' },
      priceRetail: { type: Number, default: null },
      priceWholesale: { type: Number, default: null },
      qty: { type: Number, required: true },
      isCustom: { type: Boolean, default: false },
      quality: { type: String, default: '' },
      packetSize: { type: String, default: '' },
      mrp: { type: Number, default: null }
    }
  ],
  subtotal: {
    type: Number,
    default: null
  },
  grandTotal: {
    type: Number,
    default: null
  },
  hasPricelessItem: {
    type: Boolean,
    default: false
  },
  operatorName: {
    type: String,
    default: 'System'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // TTL: automatically deletes document after 24 hours
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Bill', billSchema);
