const express = require('express');

const {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotationStatus,
} = require('../controllers/quotationController');

const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All quotation endpoints require a valid JWT.
router.use(authenticate);

router.post('/', createQuotation);
router.get('/', getQuotations);
router.get('/:id', getQuotationById);
router.patch('/:id/status', updateQuotationStatus);

module.exports = router;