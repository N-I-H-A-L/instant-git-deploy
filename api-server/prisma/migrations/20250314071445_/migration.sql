/*
  Warnings:

  - The values [IN_PROGRESS,READY] on the enum `DeploymentStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DeploymentStatus_new" AS ENUM ('NOT_STARTED', 'QUEUED', 'LIVE', 'FAILED');
ALTER TABLE "Deployment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Deployment" ALTER COLUMN "status" TYPE "DeploymentStatus_new" USING ("status"::text::"DeploymentStatus_new");
ALTER TYPE "DeploymentStatus" RENAME TO "DeploymentStatus_old";
ALTER TYPE "DeploymentStatus_new" RENAME TO "DeploymentStatus";
DROP TYPE "DeploymentStatus_old";
ALTER TABLE "Deployment" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';
COMMIT;
