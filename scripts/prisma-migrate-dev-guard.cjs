/**
 * Blocks `prisma migrate dev` when DATABASE_URL targets AWS RDS (shadow DB + drift checks are unsafe on prod).
 * Override with: ALLOW_PRISMA_MIGRATE_DEV=1 npm run prisma:migrate
 */
const url = (process.env.DATABASE_URL || "").toLowerCase();
if (url.includes("rds.amazonaws.com") && process.env.ALLOW_PRISMA_MIGRATE_DEV !== "1") {
  console.error(
    "[prisma] migrate dev is blocked: DATABASE_URL points at RDS.\n" +
      "  Use a local/disposable Postgres for migrate dev, or use: npx prisma migrate deploy\n" +
      "  If Prisma reports checksum drift after fixing migration files, run once on this database:\n" +
      "    prisma/scripts/repair_migration_checksums.sql (via psql or prisma db execute)\n" +
      "  To force migrate dev anyway: ALLOW_PRISMA_MIGRATE_DEV=1 npm run prisma:migrate"
  );
  process.exit(1);
}
