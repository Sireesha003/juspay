-- CreateTable
CREATE TABLE "AgentCashCollection" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "orderId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCashCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWithdrawal" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AgentWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentCashCollection_agentId_idx" ON "AgentCashCollection"("agentId");

-- CreateIndex
CREATE INDEX "AgentWithdrawal_agentId_idx" ON "AgentWithdrawal"("agentId");

-- CreateIndex
CREATE INDEX "AgentWithdrawal_status_idx" ON "AgentWithdrawal"("status");

-- AddForeignKey
ALTER TABLE "AgentCashCollection" ADD CONSTRAINT "AgentCashCollection_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWithdrawal" ADD CONSTRAINT "AgentWithdrawal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
