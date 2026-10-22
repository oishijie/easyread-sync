# EasyRead Sync Backend

基于 Cloudflare Workers + D1 + R2 的 EasyRead 浏览器扩展同步后端。

## 功能特性

- ✅ 用户认证（JWT + PBKDF2 密码哈希）
- ✅ 稍后阅读列表同步
- ✅ 页面笔记同步
- ✅ 访问记录同步
- ✅ 全量/增量数据同步（幂等写入 + 删除墓碑）
- ✅ 页面快照上传到 R2
- ✅ Web Dashboard（部署后直接在网址打开）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
npm run db:create
```

复制输出的 `database_id`，粘贴到 `wrangler.toml` 的 `database_id` 字段。

### 3. 初始化数据库表

```bash
npm run db:init
```

### 4. 创建 R2 存储桶

```bash
npm run r2:create
```

### 5. 设置 JWT 密钥

密钥通过 Worker Secret 保存，不要写进仓库：

```bash
openssl rand -base64 32 | npx wrangler secret put JWT_SECRET
```

### 6. 本地开发

```bash
# 本地初始化数据库（首次运行）
npm run db:init:local

# 复制本地开发用的密钥
cp .dev.vars.example .dev.vars

# 启动开发服务器
npm run dev
```

访问 `http://localhost:8787` 即是 Web Dashboard。

### 7. 部署到 Cloudflare

```bash
npm run deploy
```

## API 文档

详见 [api-design.md](./api-design.md)

### 基本用法

#### 1. 注册用户

```bash
curl -X POST https://your-worker.workers.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

响应：
```json
{
  "token": "eyJhbGc...",
  "user_id": "uuid"
}
```

#### 2. 添加稍后阅读

```bash
curl -X POST https://your-worker.workers.dev/api/read-later \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "https://example.com/",
    "url": "https://example.com/article",
    "title": "Interesting Article"
  }'
```

#### 3. 全量同步

```bash
curl -X POST https://your-worker.workers.dev/api/sync/full \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @local-data.json
```

## 数据库 Schema

详见 [schema.sql](./schema.sql)

## 项目结构

```
easyread-sync/
├── src/
│   ├── index.ts           # 主入口
│   ├── types/
│   │   └── index.ts       # TypeScript 类型定义
│   ├── lib/
│   │   ├── auth.ts        # JWT 认证
│   │   ├── cors.ts        # CORS 工具
│   │   └── db.ts          # 数据库操作
│   ├── middleware/
│   │   └── auth.ts        # 认证中间件
│   └── routes/
│       ├── auth.ts        # 认证路由
│       ├── read-later.ts  # 稍后阅读
│       ├── notes.ts       # 笔记
│       ├── records.ts     # 访问记录
│       └── sync.ts        # 同步
├── schema.sql             # 数据库 Schema
├── api-design.md          # API 设计文档
├── wrangler.toml          # Cloudflare 配置
└── package.json
```

## 后续开发计划

- [ ] 实现页面快照上传到 R2
- [ ] 开发 Web UI 界面
- [ ] 修改 EasyRead 扩展添加同步功能
- [ ] 增量同步优化
- [ ] 数据冲突解决策略
- [ ] 多设备同步测试

## License

Apache-2.0
