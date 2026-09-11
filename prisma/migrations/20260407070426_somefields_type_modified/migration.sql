-- AlterTable
ALTER TABLE "DeliveryAgentExperience" ALTER COLUMN "fromDate" SET DATA TYPE TEXT,
ALTER COLUMN "toDate" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';
