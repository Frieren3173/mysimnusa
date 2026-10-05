-- CreateEnum
CREATE TYPE "GoogleConnectionRole" AS ENUM ('SOURCE', 'DESTINATION');

-- AlterTable
ALTER TABLE "migration_connections" ADD COLUMN     "role" "GoogleConnectionRole" NOT NULL DEFAULT 'SOURCE';

-- CreateIndex
CREATE UNIQUE INDEX "migration_connections_role_key" ON "migration_connections"("role");