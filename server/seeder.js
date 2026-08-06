const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const importData = async () => {
  try {
    await connectDB();
    
    // Clear existing admin (optional)
    // await User.deleteMany({ role: 'admin' });

    const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL || 'admin@autobilling.com' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    if (adminExists) {
      console.log('Admin already exists, resetting password...');
      adminExists.password = hashedPassword;
      adminExists.isActive = true;
      await adminExists.save();
      console.log('Admin password reset successfully!');
      process.exit();
    }

    await User.create({
      name: 'Admin',
      email: process.env.ADMIN_EMAIL || 'admin@autobilling.com',
      password: hashedPassword,
      role: 'admin',
      isActive: true
    });

    console.log('Admin User Created!');
    process.exit();
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
};

importData();
