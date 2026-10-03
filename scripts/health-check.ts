// Runs every 15 minutes on the VPS (systemd timer leonyx-flow-health).
// Checks each Instagram connection's token with a cheap Graph call. If it no
// longer works, alerts on Telegram right away and every 3 hours until fixed.
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { getProviderForConnection } from "@/modules/providers/registry";
import { providerCtx } from "@/modules/engine/execute";
import { flagDeadToken, flushAlerts, isDeadTokenCode, sendAlert } from "@/modules/health/alerts";

const REMIND_MS = 3 * 60 * 60 * 1000;

async function main() {
  const conns = await prisma.socialConnection.findMany({ where: { status: "ACTIVE", provider: "INSTAGRAM" } });
  for (const c of conns) {
    try {
      await getProviderForConnection(c).fetchAccount(providerCtx(c));
      if (c.lastError?.startsWith("TOKEN_INVALID")) {
        await prisma.socialConnection.update({ where: { id: c.id }, data: { lastError: null, lastCheckedAt: new Date() } });
        await sendAlert(`✅ OpenDM: Instagram @${c.username} is working again.`);
      }
      log.info("health check ok", { connectionId: c.id, username: c.username });
    } catch (err) {
      const code = (err as { providerCode?: string }).providerCode;
      const message = err instanceof Error ? err.message : String(err);
      if (!isDeadTokenCode(code)) {
        log.warn("health check: transient error", { connectionId: c.id, code, message: message.slice(0, 200) });
        continue;
      }
      if (!c.lastError) {
        await flagDeadToken(c.id, message);
      } else if (!c.lastCheckedAt || Date.now() - c.lastCheckedAt.getTime() > REMIND_MS) {
        await prisma.socialConnection.update({ where: { id: c.id }, data: { lastCheckedAt: new Date() } });
        await sendAlert(`⏰ Reminder: OpenDM Instagram @${c.username} is still disconnected. Comments and DMs are piling up unanswered. Reconnect in OpenDM settings.`);
      }
    }
  }
}

main()
  .catch((e) => log.error("health check crashed", { error: String(e).slice(0, 300) }))
  .finally(async () => {
    await flushAlerts();
    await prisma.$disconnect();
    process.exit(0);
  });
