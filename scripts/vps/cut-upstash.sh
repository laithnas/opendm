#!/usr/bin/env bash
# Moves OpenDM's queue off Upstash (billed per Redis command) onto the VPS's own free Redis, and
# points Instagram's webhooks straight at the VPS instead of Vercel (fewer billed function calls).
# Run from the repo root on the laptop:   bash scripts/vps/cut-upstash.sh
# Undo everything:                        bash scripts/vps/rollback-upstash.sh
set -euo pipefail
VPS=root@66.175.236.111
APP=/opt/leonyx-flow
HOST=66-175-236-111.sslip.io
cd "$(dirname "$0")/../.."

echo "1/7 copy the webhook receiver"
scp -q scripts/webhook-server.ts "$VPS:$APP/scripts/"

ssh "$VPS" bash -s <<EOF
set -euo pipefail
cd $APP
STAMP=\$(date +%F-%H%M)

echo "2/7 local Redis (127.0.0.1 only, saved to disk, never evicts queue data)"
C=/etc/redis/redis.conf
cp \$C \$C.bak-\$STAMP
sed -i -E "s/^#? ?bind .*/bind 127.0.0.1 -::1/; s/^#? ?protected-mode .*/protected-mode yes/; s/^#? ?maxmemory-policy .*/maxmemory-policy noeviction/; s/^#? ?appendonly .*/appendonly yes/" \$C
grep -q "^maxmemory " \$C || echo "maxmemory 200mb" >> \$C
systemctl enable --now redis-server >/dev/null 2>&1
systemctl restart redis-server
[ "\$(redis-cli ping)" = PONG ] || { echo "local redis did not start"; exit 1; }

echo "3/7 point the worker at local Redis (old .env kept as .env.upstash-bak)"
[ -f .env.upstash-bak ] || cp .env .env.upstash-bak
grep -E "^REDIS_URL=" .env.upstash-bak | cut -d= -f2- > /root/.opendm-upstash-url
sed -i -E "s#^REDIS_URL=.*#REDIS_URL=redis://127.0.0.1:6379#" .env

echo "4/7 webhook receiver service"
cat > /etc/systemd/system/leonyx-flow-webhook.service <<UNIT
[Unit]
Description=OpenDM (Leonyx AI) — Instagram webhook receiver (replaces the Vercel route)
After=network.target redis-server.service

[Service]
WorkingDirectory=$APP
EnvironmentFile=$APP/.env
ExecStart=/usr/bin/npx tsx scripts/webhook-server.ts
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now leonyx-flow-webhook >/dev/null 2>&1
systemctl restart leonyx-flow-worker

echo "5/7 Caddy route https://$HOST/api/webhooks/instagram"
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-opendm-\$STAMP
if ! grep -q "api/webhooks/instagram" /etc/caddy/Caddyfile; then
  awk -v h="$HOST {" '{ print } \$0 == h { print "\thandle /api/webhooks/instagram {\n\t\treverse_proxy 127.0.0.1:8770\n\t}" }' /etc/caddy/Caddyfile > /tmp/Caddyfile.new
  grep -q "api/webhooks/instagram" /tmp/Caddyfile.new || { echo "could not add the Caddy route"; exit 1; }
  mv /tmp/Caddyfile.new /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy

echo "6/7 test the public URL answers Meta's verification"
# .env isn't shell-safe (e.g. EMAIL_FROM=OpenDM <...>), so read only the keys needed.
k() { grep -E "^\$1=" .env | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"\$/\1/' || true; }
META_APP_ID=\$(k META_APP_ID); META_APP_SECRET=\$(k META_APP_SECRET); META_VERIFY_TOKEN=\$(k META_VERIFY_TOKEN); META_GRAPH_VERSION=\$(k META_GRAPH_VERSION)
sleep 6
GOT=\$(curl -s "https://$HOST/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=\$META_VERIFY_TOKEN&hub.challenge=ok123")
[ "\$GOT" = ok123 ] || { echo "verification test failed (got: \$GOT). Nothing changed at Meta. Run rollback-upstash.sh"; exit 1; }

echo "7/7 switch Meta's Instagram webhook to the VPS (old settings saved to /root/.opendm-meta-subs-\$STAMP.json)"
V=\${META_GRAPH_VERSION:-v21.0}
TOKEN="\$META_APP_ID|\$META_APP_SECRET"
curl -s "https://graph.facebook.com/\$V/\$META_APP_ID/subscriptions?access_token=\$TOKEN" > /root/.opendm-meta-subs-\$STAMP.json
cp /root/.opendm-meta-subs-\$STAMP.json /root/.opendm-meta-subs-latest.json
FIELDS=\$(node -e 'const s=require("/root/.opendm-meta-subs-latest.json").data.find(x=>x.object==="instagram");if(!s)process.exit(1);console.log(s.fields.map(f=>f.name).join(","))') || { echo "no instagram subscription found at Meta; run rollback-upstash.sh"; exit 1; }
curl -s -X POST "https://graph.facebook.com/\$V/\$META_APP_ID/subscriptions" \
  --data-urlencode "object=instagram" --data-urlencode "callback_url=https://$HOST/api/webhooks/instagram" \
  --data-urlencode "fields=\$FIELDS" --data-urlencode "verify_token=\$META_VERIFY_TOKEN" --data-urlencode "access_token=\$TOKEN"
echo
echo "fields kept: \$FIELDS"

echo "finishing anything left on Upstash (90 s)"
REDIS_URL=\$(cat /root/.opendm-upstash-url) timeout 90 node --env-file=.env --import tsx src/worker/index.ts >/dev/null 2>&1 || true
echo "DONE. Watch it: journalctl -u leonyx-flow-webhook -u leonyx-flow-worker -f"
EOF
