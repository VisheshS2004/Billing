const User = require('../models/User');
const bcrypt = require('bcryptjs');

// @desc    Get all operators
// @route   GET /api/operators
// @access  Private (Admin)
exports.getOperators = async (req, res) => {
  try {
    const operators = await User.find({ role: 'operator' }).select('-password');
    res.status(200).json({ success: true, data: operators });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new operator
// @route   POST /api/operators
// @access  Private (Admin)
exports.createOperator = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const operator = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'operator',
      // createdBy: req.user.id // Add when auth is implemented
    });

    const opData = operator.toObject();
    delete opData.password;

    res.status(201).json({ success: true, data: opData });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Toggle operator active status
// @route   PATCH /api/operators/:id/toggle
// @access  Private (Admin)
exports.toggleOperatorStatus = async (req, res) => {
  try {
    const operator = await User.findById(req.params.id);
    if (!operator || operator.role !== 'operator') {
      return res.status(404).json({ success: false, message: 'Operator not found' });
    }

    operator.isActive = !operator.isActive;
    await operator.save();

    res.status(200).json({ success: true, data: operator });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete operator
// @route   DELETE /api/operators/:id
// @access  Private (Admin)
exports.deleteOperator = async (req, res) => {
  try {
    const operator = await User.findByIdAndDelete(req.params.id);
    if (!operator) {
      return res.status(404).json({ success: false, message: 'Operator not found' });
    }
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
