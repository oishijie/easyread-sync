#!/bin/sh
# 非交互部署：适用于没有浏览器的环境（CI / 容器），用 API Token 认证
#
# 用法：
#   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy ./deploy-cf.sh
#
# Token 权限需要：
#   Account → Workers Scripts:Edit
#   Account → D1:Edit
#   Account → Workers R2 Storage:Edit（可选，仅快照功能需要）
set -e

: "${CLOUDFLARE_API_TOKEN:?需要 CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?需要 CLOUDFLARE_ACCOUNT_ID}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

DB_NAME="${DB_NAME:-easyread-sync}"
WORKER_NAME="${WORKER_NAME:-easyread-sync}"

echo "1️⃣ 校验 token..."
VERIFY=$(printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" \
  | curl -s --config - https://api.cloudflare.com/client/v4/user/tokens/verify)
if ! echo "$VERIFY" | grep -q '"success":true'; then
    echo "✘ token 无效："
    echo "$VERIFY" | head -5
    exit 1
fi
echo "✓ token 有效"

echo ""
echo "2️⃣ 创建 D1 数据库 $DB_NAME..."
CREATE=$(printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" \
  | curl -s --config - -X POST \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$DB_NAME\"}")

DB_ID=$(echo "$CREATE" | grep -o '"uuid":"[^"]*"' | head -1 | sed 's/"uuid":"//;s/"//')

if [ -z "$DB_ID" ]; then
    echo "• 创建未成功，尝试查找已存在的同名数据库..."
    LIST=$(printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" \
      | curl -s --config - \
          "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database")
    DB_ID=$(echo "$LIST" | tr '}' '\n' | grep "\"name\":\"$DB_NAME\"" | grep -o '"uuid":"[^"]*"' | head -1 | sed 's/"uuid":"//;s/"//')
fi

if [ -z "$DB_ID" ]; then
    echo "✘ 无法创建或找到 D1 数据库"
    echo "$CREATE" | head -5
    exit 1
fi
echo "✓ database_id = $DB_ID"

echo ""
echo "3️⃣ 写入 wrangler.toml..."
sed -i.bak "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml
grep -n "database_id" wrangler.toml

echo ""
echo "4️⃣ 建表..."
npx wrangler d1 execute "$DB_NAME" --remote --yes --file=./schema.sql
echo "✓ 表已创建"

echo ""
echo "5️⃣ 创建 R2 存储桶..."
R2_OUT=$(printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" \
  | curl -s --config - -X POST \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets" \
      -H "Content-Type: application/json" \
      -d '{"name":"easyread-snapshots"}')
if echo "$R2_OUT" | grep -q '"success":true'; then
    echo "✓ 存储桶已创建"
elif echo "$R2_OUT" | grep -q 'already exists\|already owned'; then
    echo "• 存储桶已存在"
else
    echo "⚠️  R2 创建返回："
    echo "$R2_OUT" | head -3
    echo "   若 R2 未开通，请注释掉 wrangler.toml 中的 [[r2_buckets]] 再部署"
fi

echo ""
echo "6️⃣ 设置 JWT_SECRET..."
if npx wrangler secret list 2>/dev/null | grep -q "JWT_SECRET"; then
    echo "✓ 已存在，跳过"
else
    openssl rand -base64 32 | npx wrangler secret put JWT_SECRET
    echo "✓ 已生成"
fi

echo ""
echo "7️⃣ 部署 Worker..."
npx wrangler deploy

echo ""
echo "🎉 部署完成"
