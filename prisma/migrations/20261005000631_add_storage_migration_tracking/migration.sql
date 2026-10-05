-- CreateEnum
CREATE TYPE "StorageMigrationStatus" AS ENUM ('DRAFT', 'SCANNING', 'READY', 'RUNNING', 'PAUSED', 'FAILED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StorageMigrationItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'OPTIMIZED', 'UPLOADED', 'VERIFIED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "storage_migration_batches" (
    "id" TEXT NOT NULL,
    "createdBy" TEXT,
    "sourceProvider" TEXT NOT NULL,
    "targetProvider" TEXT NOT NULL,
    "sourceFolderId" TEXT,
    "targetFolderId" TEXT,
    "status" "StorageMigrationStatus" NOT NULL DEFAULT 'DRAFT',
    "optimize" BOOLEAN NOT NULL DEFAULT true,
    "targetSizeBytes" INTEGER NOT NULL DEFAULT 2097152,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "processedFiles" INTEGER NOT NULL DEFAULT 0,
    "succeededFiles" INTEGER NOT NULL DEFAULT 0,
    "failedFiles" INTEGER NOT NULL DEFAULT 0,
    "skippedFiles" INTEGER NOT NULL DEFAULT 0,
    "savedBytes" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_migration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_migration_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "sourceKey" TEXT,
    "destinationFileId" TEXT,
    "destinationKey" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT,
    "originalSize" INTEGER NOT NULL DEFAULT 0,
    "finalSize" INTEGER NOT NULL DEFAULT 0,
    "originalChecksum" TEXT,
    "finalChecksum" TEXT,
    "compressionStatus" TEXT,
    "strategy" TEXT,
    "status" "StorageMigrationItemStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_migration_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_migration_batches_status_idx" ON "storage_migration_batches"("status");

-- CreateIndex
CREATE INDEX "storage_migration_items_batchId_idx" ON "storage_migration_items"("batchId");

-- CreateIndex
CREATE INDEX "storage_migration_items_status_idx" ON "storage_migration_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "storage_migration_items_batchId_sourceFileId_key" ON "storage_migration_items"("batchId", "sourceFileId");

-- AddForeignKey
ALTER TABLE "storage_migration_items" ADD CONSTRAINT "storage_migration_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "storage_migration_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
