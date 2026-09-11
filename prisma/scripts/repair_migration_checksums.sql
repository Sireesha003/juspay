-- One-time repair: align _prisma_migrations.checksum with current repo migration.sql files.
-- Run against the shared Postgres used by villagkart-* APIs (same DB as .env DATABASE_URL).
-- Recompute if you change any listed migration: shasum -a 256 prisma/migrations/<dir>/migration.sql
--
-- 20260506074429_init_migration: no-op (AuditLog tables created later; fixes shadow replay P1014)
-- 20260506150000_admin_order_indexes: three Order list indexes
-- 20260507180000_backend_stabilization_enums_tables: enum extensions
-- 20260511130045_init_migration: partner Coupon (partner-api only; skip if row absent)

BEGIN;

UPDATE "_prisma_migrations"
SET checksum = '26b688761947059b95c3134781336140d86d8e471b92a2e0e570b820e171d2bf'
WHERE migration_name = '20260506074429_init_migration';

UPDATE "_prisma_migrations"
SET checksum = 'fa30c8b35655583bf67690cd2f739ce986cca544601c329bc4ced75c18bcb3e8'
WHERE migration_name = '20260506150000_admin_order_indexes';

UPDATE "_prisma_migrations"
SET checksum = 'c5cea6e651e1853cc66291819813e0ac839bc2ce68866396f124a177809d75b7'
WHERE migration_name = '20260507180000_backend_stabilization_enums_tables';

UPDATE "_prisma_migrations"
SET checksum = '7e915e6dd2420b2aba255c5267e6f917dfd8f2b90aa9c970e1b3c648604c0f4c'
WHERE migration_name = '20260511130045_init_migration';

COMMIT;

-- If migrate dev still asks for reset after you edit migration.sql again: recompute checksum with
--   shasum -a 256 prisma/migrations/<name>/migration.sql
-- and run the matching UPDATE, or re-run this whole script after updating hashes in the repo.
