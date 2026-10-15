const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { authenticate } = require('./middleware/authMiddleware');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const salesOrderRoutes = require('./routes/salesOrderRoutes');
const dispatchRoutes = require('./routes/dispatchRoutes');

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  })
);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Manufacturing ERP API is running',
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);


app.get('/api/auth/me', authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

app.use('/api/customers', customerRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/sales-orders', salesOrderRoutes);
app.use('/api/dispatches', dispatchRoutes);


// 404 handler — keep this after your API routes.


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});