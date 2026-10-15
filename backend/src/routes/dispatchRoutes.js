const express = require('express');

const {
  createDispatch,
  getDispatches,
  getDispatchById
} = require('../controllers/dispatchController');

const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const router = express.Router();

// All dispatch endpoints require authentication.
router.use(authenticate);

// Only admins can create dispatches.
router.post(
  '/',
  authorizeRoles('ADMIN'),
  createDispatch
);

// Authenticated users can view dispatch records.
router.get('/', getDispatches);
router.get('/:id', getDispatchById);

module.exports = router;