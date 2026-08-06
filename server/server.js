const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: [process.env.CLIENT_URL || 'http://localhost:5173','http://192.168.31.16:5173','http://192.168.1.148:5173'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/operators', require('./routes/operatorRoutes'));
app.use('/api/ocr', require('./routes/ocrRoutes'));
app.use('/api/abbreviations', require('./routes/abbreviationRoutes'));
app.use('/api/voice',         require('./routes/voiceRoutes'));
app.use('/api/whisper',       require('./routes/whisperRoutes'));
app.use('/api/bills',         require('./routes/billRoutes'));

app.get('/', (req, res) => {
  res.send('AutoBilling API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
