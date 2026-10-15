
const { randomBytes } = require('crypto');
const { z } = require('zod');
const prisma = require('../config/prisma');

// Validate data sent when creating a quotation.
const createQuotationSchema = z.object({
  enquiryId: z.string().uuid(),
  validUntil: z.coerce.date(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      discountPct: z.number().min(0).max(100).default(0),
      gstPct: z.number().min(0).max(100).default(18),
    })
  ).min(1),
});

const quotationStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']),
});

const roundMoney = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const makeQuotationNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  return `QUO-${date}-${suffix}`;
};

// POST /api/quotations
const createQuotation = async (req, res, next) => {
  try {
    const parsed = createQuotationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quotation data',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { enquiryId, validUntil, items } = parsed.data;

    // Prevent duplicate product lines in one quotation.
    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = [...new Set(productIds)];

    if (uniqueProductIds.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: 'A product can only appear once in a quotation',
      });
    }

    if (validUntil < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Quotation validity date must be in the future',
      });
    }

    // Load the enquiry and its actual quantities and product prices.
    const enquiry = await prisma.enquiry.findUnique({
      where: { id: enquiryId },
      include: {
        customer: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found',
      });
    }

    if (!['NEW', 'QUOTED'].includes(enquiry.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot create a quotation for an enquiry with status ${enquiry.status}`,
      });
    }

    if (enquiry.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The enquiry has no items to quote',
      });
    }

    // Every enquiry product must appear exactly once in the quotation.
    const enquiryProductIds = enquiry.items.map((item) => item.productId);
    const sortedEnquiryIds = [...enquiryProductIds].sort();
    const sortedQuoteIds = [...uniqueProductIds].sort();

    if (
      sortedEnquiryIds.length !== sortedQuoteIds.length ||
      sortedEnquiryIds.some((id, index) => id !== sortedQuoteIds[index])
    ) {
      return res.status(400).json({
        success: false,
        message: 'Quotation products must match the enquiry products exactly',
      });
    }

    // Calculate each line on the server using the enquiry quantity
    // and the product's saved base price.
    const quotationLines = enquiry.items.map((enquiryItem) => {
      const settings = items.find(
        (item) => item.productId === enquiryItem.productId
      );

      if (!enquiryItem.product.isActive) {
        throw Object.assign(
          new Error(`Product ${enquiryItem.product.code} is inactive`),
          { code: 'INACTIVE_PRODUCT' }
        );
      }

      const quantity = enquiryItem.quantity;
      const unitPrice = Number(enquiryItem.product.basePrice);
      const discountPct = settings.discountPct;
      const gstPct = settings.gstPct;

      const grossAmount = roundMoney(quantity * unitPrice);
      const discountAmount = roundMoney(
        grossAmount * discountPct / 100
      );
      const taxableAmount = roundMoney(grossAmount - discountAmount);
      const gstAmount = roundMoney(taxableAmount * gstPct / 100);
      const lineAmount = roundMoney(taxableAmount + gstAmount);

      return {
        productId: enquiryItem.productId,
        quantity,
        unitPrice,
        discountPct,
        gstPct,
        grossAmount,
        discountAmount,
        gstAmount,
        lineAmount,
      };
    });

    const subtotal = roundMoney(
      quotationLines.reduce((sum, item) => sum + item.grossAmount, 0)
    );
    const totalDiscount = roundMoney(
      quotationLines.reduce((sum, item) => sum + item.discountAmount, 0)
    );
    const totalGst = roundMoney(
      quotationLines.reduce((sum, item) => sum + item.gstAmount, 0)
    );
    const grandTotal = roundMoney(
      quotationLines.reduce((sum, item) => sum + item.lineAmount, 0)
    );

    // Save the quotation and mark the enquiry QUOTED atomically.
    // If either operation fails, the transaction rolls back.
    const quotation = await prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.enquiry.updateMany({
        where: {
          id: enquiryId,
          status: { in: ['NEW', 'QUOTED'] },
        },
        data: { status: 'QUOTED' },
      });

      if (statusUpdate.count === 0) {
        throw Object.assign(
          new Error('Enquiry status changed. Refresh and retry.'),
          { code: 'ENQUIRY_STATUS_CONFLICT' }
        );
      }

      return tx.quotation.create({
        data: {
          quotationNumber: makeQuotationNumber(),
          validUntil,
          status: 'DRAFT',
          subtotal,
          totalDiscount,
          totalGst,
          grandTotal,
          enquiry: { connect: { id: enquiryId } },
          items: {
            create: quotationLines.map((item) => ({
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPct: item.discountPct,
              gstPct: item.gstPct,
              lineAmount: item.lineAmount,
              product: { connect: { id: item.productId } },
            })),
          },
        },
        include: {
          enquiry: {
            include: { customer: true },
          },
          items: {
            include: { product: true },
          },
        },
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Quotation created successfully',
      quotation,
    });
  } catch (error) {
    if (error.code === 'INACTIVE_PRODUCT') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 'ENQUIRY_STATUS_CONFLICT') {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};

// GET /api/quotations
const getQuotations = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const { status, enquiryId } = req.query;

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

    const allowedStatuses = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quotation status',
      });
    }

    if (enquiryId && !z.string().uuid().safeParse(enquiryId).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enquiry ID',
      });
    }

    const where = {
      ...(status ? { status } : {}),
      ...(enquiryId ? { enquiryId } : {}),
    };

    const [quotations, total] = await prisma.$transaction([
      prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          enquiry: {
            include: { customer: true },
          },
          items: {
            include: { product: true },
          },
        },
      }),
      prisma.quotation.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      quotations,
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

// GET /api/quotations/:id
const getQuotationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quotation ID',
      });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        enquiry: {
          include: { customer: true },
        },
        items: {
          include: { product: true },
        },
      },
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }

    return res.status(200).json({ success: true, quotation });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/quotations/:id/status
const updateQuotationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quotation ID',
      });
    }

    const parsed = quotationStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quotation status',
        allowedStatuses: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'],
      });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }

    const allowedTransitions = {
      DRAFT: ['SENT'],
      SENT: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: [],
      REJECTED: [],
    };

    const nextStatus = parsed.data.status;

    if (!allowedTransitions[quotation.status].includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change quotation status from ${quotation.status} to ${nextStatus}`,
      });
    }

    // Conditional update prevents overwriting a status changed by another request.
    const result = await prisma.quotation.updateMany({
      where: { id, status: quotation.status },
      data: { status: nextStatus },
    });

    if (result.count === 0) {
      return res.status(409).json({
        success: false,
        message: 'Quotation status changed concurrently. Refresh and retry.',
      });
    }

    const updatedQuotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        enquiry: {
          include: { customer: true },
        },
        items: {
          include: { product: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Quotation status updated successfully',
      quotation: updatedQuotation,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotationStatus,
};
