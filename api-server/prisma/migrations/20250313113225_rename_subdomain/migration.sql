/*
  Warnings:

  - You are about to drop the column `custom_domain` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `sub_domain` on the `Project` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[subdomain]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `subdomain` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "custom_domain",
DROP COLUMN "sub_domain",
ADD COLUMN     "subdomain" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Project_subdomain_key" ON "Project"("subdomain");
