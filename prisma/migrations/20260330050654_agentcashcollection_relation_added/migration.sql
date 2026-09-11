-- AddForeignKey
ALTER TABLE "AgentCashCollection" ADD CONSTRAINT "AgentCashCollection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
