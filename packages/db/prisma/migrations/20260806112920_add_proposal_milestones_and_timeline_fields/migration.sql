-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "available_to_start" TEXT,
ADD COLUMN     "estimated_duration" TEXT,
ADD COLUMN     "portfolio_links" JSONB;

-- CreateTable
CREATE TABLE "proposal_milestones" (
    "id" BIGSERIAL NOT NULL,
    "proposal_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "duration" TEXT NOT NULL,
    "milestone_order" INTEGER NOT NULL,

    CONSTRAINT "proposal_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_milestones_proposal_id_idx" ON "proposal_milestones"("proposal_id");

-- AddForeignKey
ALTER TABLE "proposal_milestones" ADD CONSTRAINT "proposal_milestones_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restore idx_hive_records_payload_gin, dropped by Prisma drift-detection
-- because it isn't expressible in schema.prisma (see file header comment
-- and RECONCILIATION.md). Same recurrence as 20260727200929's fix.
CREATE INDEX IF NOT EXISTS idx_hive_records_payload_gin ON hive_records USING GIN (payload);
