const express = require('express');
const { transcribeAudio } = require('../controllers/whisperController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/whisper — protected, accepts { audioBase64: string, mimeType: string }
router.post('/', protect, transcribeAudio);

module.exports = router;
