-- CreateTable
CREATE TABLE "public"."Pincode" (
    "id" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pincode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pincode_pincode_key" ON "public"."Pincode"("pincode");

-- CreateIndex
CREATE INDEX "Pincode_latitude_longitude_idx" ON "public"."Pincode"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Pincode_pincode_idx" ON "public"."Pincode"("pincode");
