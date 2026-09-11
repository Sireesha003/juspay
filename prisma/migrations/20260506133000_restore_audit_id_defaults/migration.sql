ALTER TABLE "AuditLog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "AuditOutbox" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();