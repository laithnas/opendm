// Instagram webhook receiver for the VPS, so webhooks don't go through Vercel and the queue can
// live on the VPS's own Redis (Upstash bills per command; BullMQ's polling ran it up to ~$40/mo).
// Runs the exact same handler as src/app/api/webhooks/instagram/route.ts (signature check, then
// queues.ingest.add), wrapped in a plain Node HTTP server. Caddy proxies
// https://66-175-236-111.sslip.io/api/webhooks/instagram here.
//   npx tsx scripts/webhook-server.ts            (PORT=8770 by default, binds 127.0.0.1)
import http from "node:http";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/webhooks/instagram/route";
import { log } from "@/lib/logger";

const PORT = Number(process.env.WEBHOOK_PORT ?? 8770);
const PATH = "/api/webhooks/instagram";

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "https://66-175-236-111.sslip.io");
    if (url.pathname !== PATH || (req.method !== "GET" && req.method !== "POST")) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const nreq = new NextRequest(url, { method: req.method, headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined });
    const out = req.method === "GET" ? await GET(nreq) : await POST(nreq);
    res.writeHead(out.status, { "content-type": out.headers.get("content-type") ?? "text/plain" });
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    log.error("webhook-server: handler failed", { error: (e as Error).message });
    // 500 makes Meta retry the delivery later instead of dropping it.
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => log.info("webhook-server listening", { port: PORT, path: PATH }));
