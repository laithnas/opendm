-- Rename gateButtonPayload -> pendingButtonPayload (same column, same unique
-- index, just clearer now that it's reused across all three gate stages).
ALTER TABLE "FollowGateRun" RENAME COLUMN "gateButtonPayload" TO "pendingButtonPayload";
