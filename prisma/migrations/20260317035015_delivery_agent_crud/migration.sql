-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('PERMANENT', 'COMMUNICATION');

-- CreateEnum
CREATE TYPE "DeliveryAgentDocumentType" AS ENUM ('AADHAR_CARD', 'PAN_CARD', 'DRIVING_LICENSE', 'PASSPORT_PHOTO', 'SALARY_SLIP');

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "addressType" "AddressType" NOT NULL DEFAULT 'PERMANENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "fatherOrSpouseName" TEXT,
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "surname" TEXT;

-- CreateTable
CREATE TABLE "DeliveryAgentEducation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "yearOfPassing" INTEGER,
    "cgpa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAgentEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAgentExperience" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organization" TEXT,
    "designation" TEXT,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "responsibilities" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAgentExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAgentBank" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "upiId" TEXT,
    "passbookFile" TEXT,
    "declarationAccepted" BOOLEAN NOT NULL DEFAULT false,
    "kycAuthorization" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAgentBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAgentDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" "DeliveryAgentDocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAgentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAgentEducation_userId_idx" ON "DeliveryAgentEducation"("userId");

-- CreateIndex
CREATE INDEX "DeliveryAgentExperience_userId_idx" ON "DeliveryAgentExperience"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAgentBank_userId_key" ON "DeliveryAgentBank"("userId");

-- CreateIndex
CREATE INDEX "DeliveryAgentDocument_userId_idx" ON "DeliveryAgentDocument"("userId");

-- AddForeignKey
ALTER TABLE "DeliveryAgentEducation" ADD CONSTRAINT "DeliveryAgentEducation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAgentExperience" ADD CONSTRAINT "DeliveryAgentExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAgentBank" ADD CONSTRAINT "DeliveryAgentBank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAgentDocument" ADD CONSTRAINT "DeliveryAgentDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
