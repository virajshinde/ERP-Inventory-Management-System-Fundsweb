const express = require('express');

const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
} = require('../controllers/customerController');

const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Every route in this module requires a valid JWT.
router.use(authenticate);

router.post('/', createCustomer);
router.get('/', getCustomers);
router.get('/:id', getCustomerById);
router.patch('/:id', updateCustomer);

module.exports = router;