-- AlterEnum (run once; fails if value already exists — safe for single migration)
ALTER TYPE "OrderStatus" ADD VALUE 'PICKUP_OTP_PENDING';

-- CreateEnum
CREATE TYPE "OrderOtpType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateTable
CREATE TABLE "OrderOtp" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderOtpType" NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderOtp_orderId_type_isVerified_idx" ON "OrderOtp"("orderId", "type", "isVerified");

-- AddForeignKey
ALTER TABLE "OrderOtp" ADD CONSTRAINT "OrderOtp_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
