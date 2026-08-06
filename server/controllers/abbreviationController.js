const Abbreviation = require('../models/Abbreviation');
const { invalidateAbbrCache } = require('../services/ocr/abbreviationExpander');

// GET /api/abbreviations — all entries, sorted alphabetically
exports.getAbbreviations = async (req, res) => {
  try {
    const data = await Abbreviation.find().sort({ abbr: 1 });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/abbreviations — create new mapping
exports.createAbbreviation = async (req, res) => {
  try {
    const { abbr, fullName } = req.body;
    if (!abbr || !fullName) {
      return res.status(400).json({ success: false, message: 'abbr and fullName are required' });
    }
    const doc = await Abbreviation.create({ abbr: abbr.trim(), fullName: fullName.trim() });
    invalidateAbbrCache();   // ← take effect immediately
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ success: false, message: `"${req.body.abbr}" already exists` });
    }
    res.status(400).json({ success: false, message: e.message });
  }
};

// PUT /api/abbreviations/:id — update mapping
exports.updateAbbreviation = async (req, res) => {
  try {
    const { abbr, fullName } = req.body;
    const update = {};
    if (abbr)     update.abbr     = abbr.trim();
    if (fullName) update.fullName = fullName.trim();
    const doc = await Abbreviation.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    invalidateAbbrCache();   // ← take effect immediately
    res.json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ success: false, message: 'Abbreviation already exists' });
    }
    res.status(400).json({ success: false, message: e.message });
  }
};

// DELETE /api/abbreviations/:id
exports.deleteAbbreviation = async (req, res) => {
  try {
    const doc = await Abbreviation.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    invalidateAbbrCache();   // ← take effect immediately
    res.json({ success: true, data: {} });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
