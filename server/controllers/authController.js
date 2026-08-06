const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/mailer');

// In-memory OTP store (In production, use Redis)
// Format: { email: { otp: '123456', expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 } }
const otpStore = new Map();

// Helper to generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

// @desc    Login user / Admin triggers OTP
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // If Operator, return token immediately
    if (user.role === 'operator') {
      const token = generateToken(user._id, user.role);
      return res.status(200).json({
        success: true,
        data: { token, user: { id: user._id, name: user.name, role: user.role } }
      });
    }

    // If Admin, generate and send OTP
    if (user.role === 'admin') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
      
      otpStore.set(user.email, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 mins
        attempts: 0
      });
      
      console.log(`\n=== DEV MODE: Admin OTP for ${user.email} is: ${otp} ===\n`);

      // Send Email (skip if credentials are placeholders)
      if (process.env.EMAIL_USER === 'your_email@gmail.com') {
        console.log('Skipping email send because EMAIL_USER is not configured in .env');
        return res.status(200).json({
          success: true,
          message: 'OTP logged to server console (email skipped)',
          requireOtp: true,
          email: user.email
        });
      }

      try {
        await sendEmail({
          email: user.email,
          subject: 'AutoBilling Admin Login OTP',
          message: `Your OTP for admin login is: ${otp}. It is valid for 5 minutes.`
        });
        
        return res.status(200).json({
          success: true,
          message: 'OTP sent to admin email',
          requireOtp: true,
          email: user.email
        });
      } catch (err) {
        console.error(err);
        otpStore.delete(user.email);
        return res.status(500).json({ success: false, message: 'Email could not be sent' });
      }
    }

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify OTP for Admin login
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Please provide email and OTP' });
    }

    const otpData = otpStore.get(email);
    
    if (!otpData) {
      return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
    }

    if (Date.now() > otpData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (otpData.otp !== otp) {
      otpData.attempts += 1;
      if (otpData.attempts >= 3) {
        otpStore.delete(email);
        return res.status(400).json({ success: false, message: 'Too many failed attempts. Please login again.' });
      }
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // OTP is valid
    otpStore.delete(email);

    const user = await User.findOne({ email });
    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      data: { token, user: { id: user._id, name: user.name, role: user.role } }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
