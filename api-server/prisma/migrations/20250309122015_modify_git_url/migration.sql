/*
  Warnings:

  - You are about to drop the column `git_url` on the `Project` table. All the data in the column will be lost.
  - Added the required column `repo_url` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "git_url",
ADD COLUMN     "repo_url" TEXT NOT NULL;
