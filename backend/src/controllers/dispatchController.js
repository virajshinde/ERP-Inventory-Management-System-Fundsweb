const { randomBytes } = require('crypto');
const { z } = require('zod');
const prisma = require('../config/prisma');

const createDispatchSchema = z.object({
  salesOrderId: z.string().uuid(),
  vehicleNumber: z.string().trim().min(2).max(30),
  driverName: z.string().trim().min(2).max(120),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive()
    })
  ).min(1)
});

function makeDispatchNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(4).toString('hex').toUpperCase();

  return `DSP-${date}-${suffix}`;
}

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message
  });
}

// POST /api/dispatches
const createDispatch = async (req, res) => {
  const parsed = createDispatchSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(
      res,
      400,
      parsed.error.issues.map(issue => issue.message).join(', ')
    );
  }

  const { salesOrderId, vehicleNumber, driverName, items } = parsed.data;

  // A product can appear only once in a dispatch.
  const productIds = items.map(item => item.productId);

  if (new Set(productIds).size !== productIds.length) {
    return sendError(
      res,
      400,
      'Each product can appear only once in a dispatch'
    );
  }

  try {
    const dispatch = await prisma.$transaction(
      async (tx) => {
        const order = await tx.salesOrder.findUnique({
          where: { id: salesOrderId },
          include: { items: true }
        });

        if (!order) {
          throw new Error('ORDER_NOT_FOUND');
        }

        if (order.status !== 'CONFIRMED') {
          throw new Error('ORDER_NOT_CONFIRMED');
        }

        const orderItems = new Map(
          order.items.map(item => [item.productId, item])
        );

        // Validate every requested item before changing inventory.
        for (const item of items) {
          const orderItem = orderItems.get(item.productId);

          if (!orderItem) {
            throw new Error('PRODUCT_NOT_IN_ORDER');
          }

          const remaining =
            orderItem.quantity - orderItem.dispatchedQuantity;

          if (item.quantity > remaining) {
            throw new Error('DISPATCH_EXCEEDS_REMAINING');
          }
        }

        // Apply all stock and order-item updates atomically.
        for (const item of items) {
          const orderItem = orderItems.get(item.productId);

          const stockUpdate = await tx.inventory.updateMany({
            where: {
              productId: item.productId,
              physicalQuantity: { gte: item.quantity },
              reservedQuantity: { gte: item.quantity }
            },
            data: {
              physicalQuantity: { decrement: item.quantity },
              reservedQuantity: { decrement: item.quantity }
            }
          });

          if (stockUpdate.count !== 1) {
            throw new Error('INSUFFICIENT_OR_INCONSISTENT_STOCK');
          }

          const orderItemUpdate = await tx.salesOrderItem.updateMany({
            where: {
              id: orderItem.id,
              dispatchedQuantity: orderItem.dispatchedQuantity,
              quantity: {
                gte: orderItem.dispatchedQuantity + item.quantity
              }
            },
            data: {
              dispatchedQuantity: { increment: item.quantity }
            }
          });

          if (orderItemUpdate.count !== 1) {
            throw new Error('ORDER_ITEM_CONFLICT');
          }
        }

        // Record the dispatch in the same transaction.
        const createdDispatch = await tx.dispatch.create({
          data: {
            dispatchNumber: makeDispatchNumber(),
            salesOrderId,
            vehicleNumber,
            driverName,
            items: {
              create: items.map(item => ({
                productId: item.productId,
                quantity: item.quantity
              }))
            }
          },
          include: {
            items: {
              include: { product: true }
            },
            salesOrder: true
          }
        });

        // Mark the order dispatched only when every item is fulfilled.
        const updatedItems = await tx.salesOrderItem.findMany({
          where: { salesOrderId }
        });

        const fullyDispatched = updatedItems.every(
          item => item.dispatchedQuantity >= item.quantity
        );

        if (fullyDispatched) {
          const orderUpdate = await tx.salesOrder.updateMany({
            where: {
              id: salesOrderId,
              status: 'CONFIRMED'
            },
            data: { status: 'DISPATCHED' }
          });

          if (orderUpdate.count !== 1) {
            throw new Error('ORDER_STATUS_CONFLICT');
          }
        }

        return createdDispatch;
      },
      {
        isolationLevel: 'Serializable'
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Dispatch created successfully',
      data: dispatch
    });
  } catch (error) {
    const errors = {
      ORDER_NOT_FOUND: [404, 'Sales order not found'],
      ORDER_NOT_CONFIRMED: [
        400,
        'Only confirmed sales orders can be dispatched'
      ],
      PRODUCT_NOT_IN_ORDER: [
        400,
        'A requested product does not belong to this sales order'
      ],
      DISPATCH_EXCEEDS_REMAINING: [
        400,
        'Dispatch quantity exceeds the remaining order quantity'
      ],
      INSUFFICIENT_OR_INCONSISTENT_STOCK: [
        409,
        'Insufficient physical or reserved inventory for dispatch'
      ],
      ORDER_ITEM_CONFLICT: [
        409,
        'Order quantities changed concurrently. Please retry'
      ],
      ORDER_STATUS_CONFLICT: [
        409,
        'Sales order status changed concurrently. Please retry'
      ]
    };

    if (errors[error.message]) {
      const [status, message] = errors[error.message];
      return sendError(res, status, message);
    }

    if (error.code === 'P2002') {
      return sendError(
        res,
        409,
        'A duplicate dispatch number or dispatch item was detected'
      );
    }

    if (error.code === 'P2034') {
      return sendError(
        res,
        409,
        'A transaction conflict occurred. Please retry the dispatch'
      );
    }

    console.error('Create dispatch error:', error);
    return sendError(res, 500, 'Failed to create dispatch');
  }
};

// GET /api/dispatches
const getDispatches = async (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const limit = Math.min(
    Number.parseInt(req.query.limit, 10) || 10,
    100
  );

  if (page < 1 || limit < 1) {
    return sendError(res, 400, 'Page and limit must be positive');
  }

  const where = {};

  if (req.query.salesOrderId) {
    const parsedId = z.string().uuid().safeParse(
      req.query.salesOrderId
    );

    if (!parsedId.success) {
      return sendError(res, 400, 'Invalid salesOrderId');
    }

    where.salesOrderId = parsedId.data;
  }

  try {
    const [dispatches, total] = await prisma.$transaction([
      prisma.dispatch.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { dispatchDate: 'desc' },
        include: {
          salesOrder: true,
          items: {
            include: { product: true }
          }
        }
      }),
      prisma.dispatch.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      data: dispatches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get dispatches error:', error);
    return sendError(res, 500, 'Failed to fetch dispatches');
  }
};

// GET /api/dispatches/:id
const getDispatchById = async (req, res) => {
  const parsedId = z.string().uuid().safeParse(req.params.id);

  if (!parsedId.success) {
    return sendError(res, 400, 'Invalid dispatch ID');
  }

  try {
    const dispatch = await prisma.dispatch.findUnique({
      where: { id: parsedId.data },
      include: {
        salesOrder: {
          include: {
            quotation: {
              include: {
                enquiry: {
                  include: { customer: true }
                }
              }
            },
            items: {
              include: { product: true }
            }
          }
        },
        items: {
          include: { product: true }
        }
      }
    });

    if (!dispatch) {
      return sendError(res, 404, 'Dispatch not found');
    }

    return res.status(200).json({
      success: true,
      data: dispatch
    });
  } catch (error) {
    console.error('Get dispatch error:', error);
    return sendError(res, 500, 'Failed to fetch dispatch');
  }
};

module.exports = {
  createDispatch,
  getDispatches,
  getDispatchById
};