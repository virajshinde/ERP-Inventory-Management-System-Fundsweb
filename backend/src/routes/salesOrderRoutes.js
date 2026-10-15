const express = require('express');

const {
  createSalesOrder,
  getSalesOrders,
  getSalesOrderById,
  confirmSalesOrder,
  cancelSalesOrder,
} = require('../controllers/salesOrderController');

const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const router = express.Router();

// Every sales order endpoint requires authentication.
router.use(authenticate);

// Any authenticated user can create and view orders.
router.post('/', createSalesOrder);
router.get('/', getSalesOrders);
router.get('/:id', getSalesOrderById);

// Only administrators can confirm or cancel orders.
router.post(
  '/:id/confirm',
  authorizeRoles('ADMIN'),
  confirmSalesOrder
);

router.post(
  '/:id/cancel',
  authorizeRoles('ADMIN'),
  cancelSalesOrder
);

module.exports = router;