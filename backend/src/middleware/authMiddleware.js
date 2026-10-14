const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const authenticate = async (req, res, next) => {
  try {
    // 1. Read the Authorization header.
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required',
      });
    }

    // 2. Extract the token.
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required',
      });
    }

    // 3. Verify the token signature and expiry.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Fetch the current account from the database.
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    // 5. Reject missing, inactive, or role-mismatched accounts.
    if (
      !user ||
      !user.isActive ||
      user.role !== decoded.role
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive account',
      });
    }

    // 6. Attach the verified user to the request.
    req.user = user;

    next();
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    next(error);
  }
};

module.exports = { authenticate };