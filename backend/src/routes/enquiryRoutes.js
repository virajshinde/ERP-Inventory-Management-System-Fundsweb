const express = require('express');

const {
  createEnquiry,
  getEnquiries,
  getEnquiryById,
  updateEnquiryStatus,
} = require('../controllers/enquiryController');

const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All enquiry routes require authentication.
router.use(authenticate);

router.post('/', createEnquiry);
router.get('/', getEnquiries);
router.get('/:id', getEnquiryById);
router.patch('/:id/status', updateEnquiryStatus);

module.exports = router;