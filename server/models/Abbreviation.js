/**
 * Abbreviation Model
 *
 * Maps a written shorthand/abbreviation → the canonical product name stored in DB.
 *
 * Examples:
 *   "c.p"   → "Clinic Plus"
 *   "s.t"   → "Sarso Tel"
 *   "b.b"   → "Butter Bite"
 *   "aata"  → "गेहूं का आटा"   (handles Hinglish → Hindi DB name)
 *
 * The pipeline expands abbreviations BEFORE fuzzy product matching,
 * so matching accuracy improves dramatically.
 *
 * Uniqueness: one canonical name per abbreviation (case-insensitive).
 */
const mongoose = require('mongoose');

const abbreviationSchema = new mongoose.Schema({
  abbr: {
    type: String,
    required: [true, 'Abbreviation is required'],
    trim: true,
    // NOT lowercase — preserves Hindi/Devanagari script
  },
  fullName: {
    type: String,
    required: [true, 'Full product name is required'],
    trim: true,
  },
  createdBy: {
    type: String,
    default: 'admin',
  },
}, {
  timestamps: true,
});

// Each abbreviation maps to exactly one canonical name
abbreviationSchema.index({ abbr: 1 }, { unique: true });

module.exports = mongoose.model('Abbreviation', abbreviationSchema);
