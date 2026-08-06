const express = require('express');
const {
  saveBill,
  getBills,
  getBillById,
  updateBill
} = require('../controllers/billController');

const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

router
  .route('/')
  .post(saveBill)
  .get(getBills);

router
  .route('/:id')
  .get(getBillById)
  .put(updateBill);

module.exports = router;
