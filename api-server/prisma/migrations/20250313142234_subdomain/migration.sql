/*
  Warnings:

  - You are about to drop the column `subdomain` on the `Project` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[subdomain]` on the table `Deployment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `subdomain` to the `Deployment` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Project_subdomain_key";

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "subdomain" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "subdomain";

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_subdomain_key" ON "Deployment"("subdomain");
