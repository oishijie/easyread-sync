#!/bin/bash
# EasyRead Sync 一键部署脚本

set -e

echo "🚀 EasyRead Sync 部署脚本"
echo "=========================="
echo ""

# 检查 wrangler 是否已安装
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI 未安装"
    echo "正在安装..."
    npm install -g wrangler
fi

# 检查是否已登录
echo "📋 检查 Cloudflare 登录状态..."
if ! wrangler whoami &> /dev/null; then
    echo "请先登录 Cloudflare："
    wrangler login
fi

echo ""
echo "1️⃣ 创建 D1 数据库..."
DB_OUTPUT=$(wrangler d1 create easyread-sync 2>&1 || true)

if echo "$DB_OUTPUT" | grep -q "database_id"; then
    DB_ID=$(echo "$DB_OUTPUT" | grep "database_id" | sed 's/.*database_id = "\(.*\)".*/\1/')
    echo "✅ 数据库已创建: $DB_ID"
    
    # 自动更新 wrangler.toml
    if [ -f "wrangler.toml" ]; then
        sed -i.bak "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml
        echo "✅ wrangler.toml 已更新"
    fi
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
echo "4️⃣ 检查 JWT_SECRET..."
if grep -q 'JWT_SECRET = ""' wrangler.toml; then
    JWT_SECRET=$(openssl rand -base64 32)
    sed -i.bak "s/JWT_SECRET = \"\"/JWT_SECRET = \"$JWT_SECRET\"/" wrangler.toml
    echo "✅ JWT_SECRET 已自动生成"
else
    echo "✅ JWT_SECRET 已配置"
fi

echo ""
echo "5️⃣ 部署到 Cloudflare Workers..."
wrangler deploy

echo ""
echo "🎉 部署完成！"
echo ""
echo "你的 API 地址："
echo "https://easyread-sync.your-subdomain.workers.dev"
echo ""
echo "下一步："
echo "1. 测试 API: curl https://your-url/health"
echo "2. 在 EasyRead 扩展中配置同步功能"
echo "3. 查看 EXTENSION_INTEGRATION.md 了解更多"
