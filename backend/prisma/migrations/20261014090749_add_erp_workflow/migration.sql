-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALES_USER');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPATCHED', 'CANCELLED');

-- DropIndex
DROP INDEX "inventory_productId_idx";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SALES_USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "companyName" VARCHAR(180) NOT NULL,
    "contactPerson" VARCHAR(120) NOT NULL,
    "mobile" VARCHAR(25) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" UUID NOT NULL,
    "enquiryNumber" VARCHAR(30) NOT NULL,
    "customerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "enquiryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryItem" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "EnquiryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" UUID NOT NULL,
    "quotationNumber" VARCHAR(30) NOT NULL,
    "enquiryId" UUID NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "totalDiscount" DECIMAL(14,2) NOT NULL,
    "totalGst" DECIMAL(14,2) NOT NULL,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstPct" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "lineAmount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "orderNumber" VARCHAR(30) NOT NULL,
    "quotationId" UUID NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dispatchedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" UUID NOT NULL,
    "dispatchNumber" VARCHAR(30) NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "dispatchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleNumber" VARCHAR(30) NOT NULL,
    "driverName" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchItem" (
    "id" UUID NOT NULL,
    "dispatchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Enquiry_enquiryNumber_key" ON "Enquiry"("enquiryNumber");

-- CreateIndex
CREATE INDEX "Enquiry_customerId_idx" ON "Enquiry"("customerId");

-- CreateIndex
CREATE INDEX "Enquiry_status_idx" ON "Enquiry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EnquiryItem_enquiryId_productId_key" ON "EnquiryItem"("enquiryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");

-- CreateIndex
CREATE INDEX "Quotation_enquiryId_idx" ON "Quotation"("enquiryId");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationItem_quotationId_productId_key" ON "QuotationItem"("quotationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_quotationId_key" ON "SalesOrder"("quotationId");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderItem_salesOrderId_productId_key" ON "SalesOrderItem"("salesOrderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_dispatchNumber_key" ON "Dispatch"("dispatchNumber");

-- CreateIndex
CREATE INDEX "Dispatch_salesOrderId_idx" ON "Dispatch"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchItem_dispatchId_productId_key" ON "DispatchItem"("dispatchId", "productId");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryItem" ADD CONSTRAINT "EnquiryItem_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryItem" ADD CONSTRAINT "EnquiryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
