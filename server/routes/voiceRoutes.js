const express = require('express');
const { parseVoice } = require('../controllers/voiceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/voice — protected, accepts { transcript: string }
router.post('/', protect, parseVoice);

module.exports = router;
