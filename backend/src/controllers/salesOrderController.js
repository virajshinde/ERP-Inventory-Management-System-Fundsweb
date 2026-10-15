
const { randomBytes } = require('crypto');
const { z } = require('zod');
const prisma = require('../config/prisma');

const createOrderSchema = z.object({
  quotationId: z.string().uuid(),
});

const orderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  return `SO-${date}-${suffix}`;
};

// POST /api/sales-orders
// Create an order from an ACCEPTED quotation.
const createSalesOrder = async (req, res, next) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'A valid quotationId is required',
        errors: parsed.error.issues,
      });
    }

    const { quotationId } = parsed.data;

    const order = await prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({
        where: { id: quotationId },
        include: { items: true },
      });

      if (!quotation) {
        throw Object.assign(new Error('Quotation not found'), {
          code: 'QUOTATION_NOT_FOUND',
        });
      }

      if (quotation.status !== 'ACCEPTED') {
        throw Object.assign(
          new Error('Only ACCEPTED quotations can become sales orders'),
          { code: 'QUOTATION_NOT_ACCEPTED' }
        );
      }

      if (quotation.validUntil < new Date()) {
        throw Object.assign(new Error('Quotation has expired'), {
          code: 'QUOTATION_EXPIRED',
        });
      }

      if (quotation.items.length === 0) {
        throw Object.assign(new Error('Quotation has no items'), {
          code: 'QUOTATION_EMPTY',
        });
      }

      // quotationId is unique in the database. This is the final
      // safeguard against creating two orders for one quotation.
      return tx.salesOrder.create({
        data: {
          orderNumber: orderNumber(),
          quotation: { connect: { id: quotation.id } },
          totalAmount: quotation.grandTotal,
          status: 'PENDING',
          items: {
            create: quotation.items.map((item) => ({
              product: { connect: { id: item.productId } },
              quantity: item.quantity,
              dispatchedQuantity: 0,
            })),
          },
        },
        include: {
          quotation: true,
          items: { include: { product: true } },
        },
      });
    }, { isolationLevel: 'Serializable' });

    return res.status(201).json({
      success: true,
      message: 'Sales order created successfully',
      salesOrder: order,
    });
  } catch (error) {
    if (error.code === 'QUOTATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: error.message });
    }

    if ([
      'QUOTATION_NOT_ACCEPTED',
      'QUOTATION_EXPIRED',
      'QUOTATION_EMPTY',
    ].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }

    // P2002 means a unique constraint was violated, such as trying
    // to create a second order for the same quotation.
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A sales order already exists for this quotation',
      });
    }

    // PostgreSQL/Prisma may report a serializable transaction conflict.
    if (error.code === 'P2034') {
      return res.status(409).json({
        success: false,
        message: 'Concurrent change detected. Refresh and retry.',
      });
    }

    next(error);
  }
};

// GET /api/sales-orders
const getSalesOrders = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const { status } = req.query;

    const statuses = [
      'PENDING',
      'CONFIRMED',
      'DISPATCHED',
      'CANCELLED',
    ];

    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination values',
      });
    }

    if (status && !statuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales order status',
      });
    }

    const where = status ? { status } : {};

    const [salesOrders, total] = await prisma.$transaction([
      prisma.salesOrder.findMany({
        where,
        orderBy: { orderDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          quotation: {
            include: {
              enquiry: { include: { customer: true } },
            },
          },
          items: { include: { product: true } },
        },
      }),
      prisma.salesOrder.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      salesOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/sales-orders/:id
const getSalesOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales order ID',
      });
    }

    const salesOrder = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        quotation: {
          include: {
            enquiry: { include: { customer: true } },
          },
        },
        items: { include: { product: true } },
        dispatches: { include: { items: true } },
      },
    });

    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: 'Sales order not found',
      });
    }

    return res.status(200).json({ success: true, salesOrder });
  } catch (error) {
    next(error);
  }
};

// POST /api/sales-orders/:id/confirm
// ADMIN only: reserve stock before confirming the order.
const confirmSalesOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales order ID',
      });
    }

    const salesOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        throw Object.assign(new Error('Sales order not found'), {
          code: 'ORDER_NOT_FOUND',
        });
      }

      if (order.status !== 'PENDING') {
        throw Object.assign(
          new Error(`Cannot confirm an order with status ${order.status}`),
          { code: 'ORDER_INVALID_STATUS' }
        );
      }

      // Check and reserve every product inside the same transaction.
      // If any item fails, all earlier reservations roll back.
      for (const item of order.items) {
        const inventory = await tx.inventory.findUnique({
          where: { productId: item.productId },
        });

        if (!inventory) {
          throw Object.assign(
            new Error(`Inventory not found for product ${item.productId}`),
            { code: 'INVENTORY_NOT_FOUND' }
          );
        }

        const available =
          inventory.physicalQuantity - inventory.reservedQuantity;

        if (available < item.quantity) {
          throw Object.assign(
            new Error(
              `Insufficient available stock for product ${item.productId}. ` +
              `Available: ${available}, required: ${item.quantity}`
            ),
            { code: 'INSUFFICIENT_STOCK' }
          );
        }

        // Optimistic condition: update only if the inventory numbers
        // still match what we read. Serializable isolation adds
        // protection against concurrent reservation transactions.
        const reserved = await tx.inventory.updateMany({
          where: {
            productId: item.productId,
            physicalQuantity: inventory.physicalQuantity,
            reservedQuantity: inventory.reservedQuantity,
          },
          data: {
            reservedQuantity: { increment: item.quantity },
          },
        });

        if (reserved.count !== 1) {
          throw Object.assign(
            new Error('Inventory changed concurrently. Refresh and retry.'),
            { code: 'INVENTORY_CONFLICT' }
          );
        }
      }

      // Change the order status only after every reservation succeeds.
      const changed = await tx.salesOrder.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });

      if (changed.count !== 1) {
        throw Object.assign(
          new Error('Order status changed concurrently. Refresh and retry.'),
          { code: 'ORDER_CONFLICT' }
        );
      }

      return tx.salesOrder.findUnique({
        where: { id },
        include: {
          quotation: true,
          items: { include: { product: true } },
        },
      });
    }, { isolationLevel: 'Serializable' });

    return res.status(200).json({
      success: true,
      message: 'Sales order confirmed and inventory reserved',
      salesOrder,
    });
  } catch (error) {
    if (error.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ success: false, message: error.message });
    }

    if ([
      'ORDER_INVALID_STATUS',
      'INSUFFICIENT_STOCK',
      'INVENTORY_NOT_FOUND',
    ].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }

    if ([
      'INVENTORY_CONFLICT',
      'ORDER_CONFLICT',
      'P2034',
    ].includes(error.code)) {
      return res.status(409).json({
        success: false,
        message: error.message || 'Concurrent change detected. Refresh and retry.',
      });
    }

    next(error);
  }
};

// POST /api/sales-orders/:id/cancel
// ADMIN only. A confirmed order can be cancelled only before dispatch.
const cancelSalesOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales order ID',
      });
    }

    const salesOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        throw Object.assign(new Error('Sales order not found'), {
          code: 'ORDER_NOT_FOUND',
        });
      }

      if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
        throw Object.assign(
          new Error(`Cannot cancel an order with status ${order.status}`),
          { code: 'ORDER_INVALID_STATUS' }
        );
      }

      if (order.items.some((item) => item.dispatchedQuantity > 0)) {
        throw Object.assign(
          new Error('An order with dispatched items cannot be cancelled'),
          { code: 'ORDER_ALREADY_DISPATCHED' }
        );
      }

      // A confirmed order has reserved stock; release it before cancelling.
      if (order.status === 'CONFIRMED') {
        for (const item of order.items) {
          const inventory = await tx.inventory.findUnique({
            where: { productId: item.productId },
          });

          if (!inventory || inventory.reservedQuantity < item.quantity) {
            throw Object.assign(
              new Error('Inventory reservation is inconsistent. Contact an administrator.'),
              { code: 'RESERVATION_INCONSISTENT' }
            );
          }

          const released = await tx.inventory.updateMany({
            where: {
              productId: item.productId,
              physicalQuantity: inventory.physicalQuantity,
              reservedQuantity: inventory.reservedQuantity,
            },
            data: {
              reservedQuantity: { decrement: item.quantity },
            },
          });

          if (released.count !== 1) {
            throw Object.assign(
              new Error('Inventory changed concurrently. Refresh and retry.'),
              { code: 'INVENTORY_CONFLICT' }
            );
          }
        }
      }

      const changed = await tx.salesOrder.updateMany({
        where: { id, status: order.status },
        data: { status: 'CANCELLED' },
      });

      if (changed.count !== 1) {
        throw Object.assign(
          new Error('Order status changed concurrently. Refresh and retry.'),
          { code: 'ORDER_CONFLICT' }
        );
      }

      return tx.salesOrder.findUnique({
        where: { id },
        include: { items: true, quotation: true },
      });
    }, { isolationLevel: 'Serializable' });

    return res.status(200).json({
      success: true,
      message: 'Sales order cancelled successfully',
      salesOrder,
    });
  } catch (error) {
    if (error.code === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ success: false, message: error.message });
    }

    if ([
      'ORDER_INVALID_STATUS',
      'ORDER_ALREADY_DISPATCHED',
      'RESERVATION_INCONSISTENT',
    ].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }

    if ([
      'INVENTORY_CONFLICT',
      'ORDER_CONFLICT',
      'P2034',
    ].includes(error.code)) {
      return res.status(409).json({
        success: false,
        message: error.message || 'Concurrent change detected. Refresh and retry.',
      });
    }

    next(error);
  }
};

module.exports = {
  createSalesOrder,
  getSalesOrders,
  getSalesOrderById,
  confirmSalesOrder,
  cancelSalesOrder,
};
