const express = require('express');
const { recognizeText } = require('../controllers/ocrController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/ocr — protected, accepts { imageBase64 }
router.post('/', protect, recognizeText);

module.exports = router;
