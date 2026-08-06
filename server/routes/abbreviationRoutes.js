const express = require('express');
const {
  getAbbreviations,
  createAbbreviation,
  updateAbbreviation,
  deleteAbbreviation,
} = require('../controllers/abbreviationController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.route('/')
  .get(getAbbreviations)
  .post(authorize('admin', 'operator'), createAbbreviation);

router.route('/:id')
  .put(authorize('admin', 'operator'), updateAbbreviation)
  .delete(authorize('admin', 'operator'), deleteAbbreviation);

module.exports = router;
