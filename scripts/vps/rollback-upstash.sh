#!/usr/bin/env bash
# Undoes cut-upstash.sh: worker back on Upstash, Instagram webhooks back to Vercel.
#   bash scripts/vps/rollback-upstash.sh
set -euo pipefail
VPS=root@66.175.236.111
ssh "$VPS" bash -s <<'EOF'
set -euo pipefail
cd /opt/leonyx-flow
[ -f .env.upstash-bak ] && cp .env.upstash-bak .env
systemctl restart leonyx-flow-worker
systemctl disable --now leonyx-flow-webhook 2>/dev/null || true
if [ -f /root/.opendm-meta-subs-latest.json ]; then
  k() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/' || true; }
  META_APP_ID=$(k META_APP_ID); META_APP_SECRET=$(k META_APP_SECRET); META_VERIFY_TOKEN=$(k META_VERIFY_TOKEN); META_GRAPH_VERSION=$(k META_GRAPH_VERSION)
  V=${META_GRAPH_VERSION:-v21.0}
  read -r URL FIELDS < <(node -e 'const s=require("/root/.opendm-meta-subs-latest.json").data.find(x=>x.object==="instagram");console.log(s.callback_url, s.fields.map(f=>f.name).join(","))')
  curl -s -X POST "https://graph.facebook.com/$V/$META_APP_ID/subscriptions" \
    --data-urlencode "object=instagram" --data-urlencode "callback_url=$URL" --data-urlencode "fields=$FIELDS" \
    --data-urlencode "verify_token=$META_VERIFY_TOKEN" --data-urlencode "access_token=$META_APP_ID|$META_APP_SECRET"
  echo; echo "Meta webhook back to $URL"
fi
echo "rolled back"
EOF
