const { z } = require('zod');
const prisma = require('../config/prisma');

const customerSchema = z.object({
  companyName: z.string().trim().min(2).max(180),
  contactPerson: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(7).max(25),
  email: z.string().trim().email().max(255).transform((v) => v.toLowerCase()),
  city: z.string().trim().min(2).max(100),
});

const updateCustomerSchema = customerSchema.partial();

// POST /api/customers
const createCustomer = async (req, res, next) => {
  try {
    const result = customerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer data',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const customer = await prisma.customer.create({
      data: result.data,
    });

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      customer,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/customers
const getCustomers = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);

    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Page must be positive and limit must be between 1 and 100',
      });
    }

    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count(),
    ]);

    return res.status(200).json({
      success: true,
      customers,
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

// GET /api/customers/:id
const getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID',
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    return res.status(200).json({
      success: true,
      customer,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/customers/:id
const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!z.uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID',
      });
    }

    const result = updateCustomerSchema.safeParse(req.body);

    if (!result.success || Object.keys(result.data || {}).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one valid customer field',
        errors: result.success
          ? []
          : result.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
      });
    }

    const existingCustomer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: result.data,
    });

    return res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      customer,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
};