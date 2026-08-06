const Bill = require('../models/Bill');

// @desc    Save a new bill
// @route   POST /api/bills
// @access  Private
exports.saveBill = async (req, res) => {
  try {
    const { customerName, priceType, items, subtotal, grandTotal, hasPricelessItem } = req.body;

    const operatorName = req.user ? req.user.name : 'System';

    const bill = await Bill.create({
      customerName: customerName || 'Cash',
      priceType,
      items,
      subtotal,
      grandTotal,
      hasPricelessItem,
      operatorName
    });

    res.status(201).json({
      success: true,
      data: bill
    });
  } catch (error) {
    console.error('Error saving bill:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all bills (supports searching by customer name)
// @route   GET /api/bills
// @access  Private
exports.getBills = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      // Support case-insensitive search by customer name
      query.customerName = { $regex: search, $options: 'i' };
    }

    // Return bills sorted by most recent first
    const bills = await Bill.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bills.length,
      data: bills
    });
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get a single bill by ID
// @route   GET /api/bills/:id
// @access  Private
exports.getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    res.status(200).json({
      success: true,
      data: bill
    });
  } catch (error) {
    console.error('Error fetching bill details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update an existing bill
// @route   PUT /api/bills/:id
// @access  Private
exports.updateBill = async (req, res) => {
  try {
    const { customerName, priceType, items, subtotal, grandTotal, hasPricelessItem } = req.body;

    let bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    // Update bill fields
    bill.customerName = customerName || 'Cash';
    bill.priceType = priceType;
    bill.items = items;
    bill.subtotal = subtotal;
    bill.grandTotal = grandTotal;
    bill.hasPricelessItem = hasPricelessItem;
    if (req.user) {
      bill.operatorName = req.user.name;
    }

    await bill.save();

    res.status(200).json({
      success: true,
      data: bill
    });
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
