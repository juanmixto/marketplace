-- CreateEnum
CREATE TYPE "ShippingProviderCode" AS ENUM ('SENDCLOUD');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM (
  'DRAFT',
  'LABEL_REQUESTED',
  'LABEL_CREATED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'CANCELLED',
  'FAILED'
);

-- CreateEnum
CREATE TYPE "ShipmentEventSource" AS ENUM ('SYSTEM', 'PROVIDER_WEBHOOK', 'MANUAL_ADMIN', 'MANUAL_VENDOR');

-- AlterEnum (FulfillmentStatus new values)
ALTER TYPE "FulfillmentStatus" ADD VALUE 'LABEL_REQUESTED';
ALTER TYPE "FulfillmentStatus" ADD VALUE 'LABEL_FAILED';
ALTER TYPE "FulfillmentStatus" ADD VALUE 'INCIDENT';

-- AlterTable Vendor
ALTER TABLE "Vendor" ADD COLUMN "preferredShippingProvider" "ShippingProviderCode";

-- CreateTable VendorAddress
CREATE TABLE "VendorAddress" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "label" TEXT,
  "contactName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "city" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'ES',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VendorAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorAddress_vendorId_isDefault_idx" ON "VendorAddress"("vendorId", "isDefault");

-- AddForeignKey
ALTER TABLE "VendorAddress" ADD CONSTRAINT "VendorAddress_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable VendorFulfillment
ALTER TABLE "VendorFulfillment" ADD COLUMN "vendorAddressId" TEXT;

-- AddForeignKey
ALTER TABLE "VendorFulfillment" ADD CONSTRAINT "VendorFulfillment_vendorAddressId_fkey" FOREIGN KEY ("vendorAddressId") REFERENCES "VendorAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Shipment
CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "fulfillmentId" TEXT NOT NULL,
  "providerCode" "ShippingProviderCode" NOT NULL,
  "providerRef" TEXT,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
  "fromAddressSnapshot" JSONB NOT NULL,
  "toAddressSnapshot" JSONB NOT NULL,
  "weightGrams" INTEGER NOT NULL,
  "parcelCount" INTEGER NOT NULL DEFAULT 1,
  "carrierName" TEXT,
  "trackingNumber" TEXT,
  "trackingUrl" TEXT,
  "labelUrl" TEXT,
  "labelFormat" TEXT,
  "labelPrintedAt" TIMESTAMP(3),
  "labelRequestedAt" TIMESTAMP(3),
  "labelCreatedAt" TIMESTAMP(3),
  "handedOverAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "providerMeta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_fulfillmentId_key" ON "Shipment"("fulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_idempotencyKey_key" ON "Shipment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_providerCode_providerRef_idx" ON "Shipment"("providerCode", "providerRef");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "VendorFulfillment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable ShipmentEvent
CREATE TABLE "ShipmentEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "source" "ShipmentEventSource" NOT NULL,
  "type" TEXT NOT NULL,
  "status" "ShipmentStatus",
  "message" TEXT,
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_type_idx" ON "ShipmentEvent"("type");

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
