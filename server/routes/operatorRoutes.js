const express = require('express');
const {
  getOperators,
  createOperator,
  toggleOperatorStatus,
  deleteOperator
} = require('../controllers/operatorController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router
  .route('/')
  .get(getOperators)
  .post(createOperator);

router
  .route('/:id/toggle')
  .patch(toggleOperatorStatus);

router
  .route('/:id')
  .delete(deleteOperator);

module.exports = router;
