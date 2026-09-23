-- AlterEnum
ALTER TYPE "ActionKind" ADD VALUE 'FOLLOW_GATE';

-- CreateTable
CREATE TABLE "FollowGateRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "socialConnectionId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "gateButtonPayload" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowGateRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowGateRun_gateButtonPayload_key" ON "FollowGateRun"("gateButtonPayload");

-- CreateIndex
CREATE INDEX "FollowGateRun_workspaceId_idx" ON "FollowGateRun"("workspaceId");

-- CreateIndex
CREATE INDEX "FollowGateRun_contactId_idx" ON "FollowGateRun"("contactId");

-- AddForeignKey
ALTER TABLE "FollowGateRun" ADD CONSTRAINT "FollowGateRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowGateRun" ADD CONSTRAINT "FollowGateRun_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AutomationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowGateRun" ADD CONSTRAINT "FollowGateRun_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowGateRun" ADD CONSTRAINT "FollowGateRun_socialConnectionId_fkey" FOREIGN KEY ("socialConnectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
