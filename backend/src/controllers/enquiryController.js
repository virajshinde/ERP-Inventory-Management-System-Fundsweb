const { randomBytes } = require('crypto');
const { z } = require('zod');
const prisma = require('../config/prisma');

const enquiryItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const createEnquirySchema = z.object({
  customerId: z.string().uuid(),
  requiredDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
  items: z.array(enquiryItemSchema).min(1),
});

const statusSchema = z.object({
  status: z.enum(['NEW', 'QUOTED', 'WON', 'LOST']),
});

const makeEnquiryNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(4).toString('hex').toUpperCase();

  return `ENQ-${date}-${suffix}`;
};

// POST /api/enquiries
const createEnquiry = async (req, res, next) => {
  try {
    const result = createEnquirySchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enquiry data',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { customerId, requiredDate, notes, items } = result.data;

    // Each product may appear only once in an enquiry.
    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = [...new Set(productIds)];

    if (uniqueProductIds.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: 'A product can only appear once in an enquiry',
      });
    }

    // Verify that the customer exists.
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    // Verify that every requested product exists and is active.
    const products = await prisma.product.findMany({
      where: {
        id: { in: uniqueProductIds },
        isActive: true,
      },
      select: { id: true },
    });

    if (products.length !== uniqueProductIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more products do not exist or are inactive',
      });
    }

    // Save the enquiry and all its items together.
    const enquiry = await prisma.enquiry.create({
      data: {
        enquiryNumber: makeEnquiryNumber(),
        customer: {
          connect: { id: customerId },
        },
        createdBy: {
          connect: { id: req.user.id },
        },
        ...(requiredDate ? { requiredDate } : {}),
        ...(notes ? { notes } : {}),
        items: {
          create: items.map((item) => ({
            quantity: item.quantity,
            product: {
              connect: { id: item.productId },
            },
          })),
        },
      },
      include: {
        customer: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Enquiry created successfully',
      enquiry,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/enquiries
const getEnquiries = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const { status, customerId } = req.query;

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

    if (
      status &&
      !['NEW', 'QUOTED', 'WON', 'LOST'].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enquiry status',
      });
    }

    if (customerId && !z.string().uuid().safeParse(customerId).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID',
      });
    }

    const where = {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const [enquiries, total] = await prisma.$transaction([
      prisma.enquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: true,
          items: {
            include: { product: true },
          },
        },
      }),
      prisma.enquiry.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      enquiries,
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

// GET /api/enquiries/:id
const getEnquiryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enquiry ID',
      });
    }

    const enquiry = await prisma.enquiry.findUnique({
      where: { id },
      include: {
        customer: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          include: { product: true },
        },
        quotations: true,
      },
    });

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found',
      });
    }

    return res.status(200).json({
      success: true,
      enquiry,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/enquiries/:id/status
const updateEnquiryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enquiry ID',
      });
    }

    const result = statusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enquiry status',
        allowedStatuses: ['NEW', 'QUOTED', 'WON', 'LOST'],
      });
    }

    const enquiry = await prisma.enquiry.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found',
      });
    }

    // Quotation creation will automatically set NEW -> QUOTED.
    // This endpoint handles losing an enquiry or closing a quotation outcome.
    const allowedTransitions = {
      NEW: ['LOST'],
      QUOTED: ['WON', 'LOST'],
      WON: [],
      LOST: [],
    };

    const nextStatus = result.data.status;

    if (!allowedTransitions[enquiry.status].includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change enquiry status from ${enquiry.status} to ${nextStatus}`,
      });
    }

    // Conditional update prevents overwriting a status that changed
    // after the enquiry was read.
    const updateResult = await prisma.enquiry.updateMany({
      where: {
        id,
        status: enquiry.status,
      },
      data: { status: nextStatus },
    });

    if (updateResult.count === 0) {
      return res.status(409).json({
        success: false,
        message: 'Enquiry status changed concurrently. Refresh and retry.',
      });
    }

    const updatedEnquiry = await prisma.enquiry.findUnique({
      where: { id },
      include: { customer: true },
    });

    return res.status(200).json({
      success: true,
      message: 'Enquiry status updated successfully',
      enquiry: updatedEnquiry,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEnquiry,
  getEnquiries,
  getEnquiryById,
  updateEnquiryStatus,
};