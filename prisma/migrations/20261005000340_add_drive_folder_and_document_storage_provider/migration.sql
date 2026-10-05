-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "storageProvider" TEXT;

-- CreateTable
CREATE TABLE "drive_folders" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drive_folders_path_key" ON "drive_folders"("path");
