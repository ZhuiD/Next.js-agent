-- CreateEnum
CREATE TYPE "QuotaUsageStatus" AS ENUM ('RESERVED', 'CONSUMED', 'REFUNDED');

-- CreateTable
CREATE TABLE "QuotaUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "chatId" TEXT,
    "plan" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "limit" INTEGER NOT NULL,
    "status" "QuotaUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "consumeReason" TEXT,
    "refundReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "QuotaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuotaUsage_requestId_key" ON "QuotaUsage"("requestId");

-- CreateIndex
CREATE INDEX "QuotaUsage_userId_createdAt_idx" ON "QuotaUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuotaUsage_status_createdAt_idx" ON "QuotaUsage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "QuotaUsage" ADD CONSTRAINT "QuotaUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
