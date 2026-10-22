#!/bin/bash
# EasyRead Sync 一键部署脚本

set -e

echo "🚀 EasyRead Sync 部署脚本"
echo "=========================="
echo ""

if ! command -v wrangler > /dev/null; then
    echo "Wrangler CLI 未安装，正在安装..."
    npm install -g wrangler
fi

echo "📋 检查 Cloudflare 登录状态..."
if ! wrangler whoami > /dev/null 2>&1; then
    echo "请先登录 Cloudflare："
    wrangler login
fi

echo ""
echo "1️⃣ 创建 D1 数据库..."
DB_OUTPUT=$(wrangler d1 create easyread-sync 2>&1 || true)

if echo "$DB_OUTPUT" | grep -q "database_id"; then
    DB_ID=$(echo "$DB_OUTPUT" | grep "database_id" | sed 's/.*database_id = "\(.*\)".*/\1/')
    echo "✅ 数据库已创建: $DB_ID"
    sed -i.bak "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml
    echo "✅ wrangler.toml 已更新"
else
    echo "⚠️  数据库可能已存在，继续..."
fi

echo ""
echo "2️⃣ 初始化数据库表..."
wrangler d1 execute easyread-sync --file=./schema.sql
echo "✅ 数据库表已创建"

echo ""
echo "3️⃣ 创建 R2 存储桶..."
wrangler r2 bucket create easyread-snapshots 2>&1 || echo "⚠️  存储桶可能已存在"
echo "✅ R2 存储桶就绪"

echo ""
echo "4️⃣ 设置 JWT_SECRET..."
if wrangler secret list 2>/dev/null | grep -q "JWT_SECRET"; then
    echo "✅ JWT_SECRET 已配置"
else
    JWT_SECRET=$(openssl rand -base64 32)
    echo "$JWT_SECRET" | wrangler secret put JWT_SECRET
    echo "✅ JWT_SECRET 已生成并写入 Cloudflare"
fi

echo ""
echo "5️⃣ 部署到 Cloudflare Workers..."
wrangler deploy

echo ""
echo "🎉 部署完成！"
echo "打开 wrangler 输出的网址即可使用 Web Dashboard，并用同一地址配置扩展同步。"
