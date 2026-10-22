// EasyRead Sync Backend - Main Entry
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import { corsHeaders, jsonResponse } from './lib/cors';

// Routes
import auth from './routes/auth';
import readLater from './routes/read-later';
import notes from './routes/notes';
import records from './routes/records';
import sync from './routes/sync';
import snapshots from './routes/snapshots';

const app = new Hono<{ Bindings: Env }>();

// CORS 中间件
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '*';
  
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(c.env.CORS_ORIGIN || origin)
    });
  }
  
  await next();
  
  const response = c.res;
  Object.entries(corsHeaders(c.env.CORS_ORIGIN || origin)).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
});

// Web UI (首页)
app.get('/', async (c) => {
  // 简单重定向到 /dashboard
  return c.redirect('/dashboard');
});

// Dashboard 页面
app.get('/dashboard', async (c) => {
  // 从文件系统读取 HTML
  // 注意：实际部署时需要将 HTML 打包进 Worker
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EasyRead Sync - Dashboard</title>
  <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; padding: 20px; } .container { max-width: 1200px; margin: 0 auto; } .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); } .header h1 { color: #333; margin-bottom: 10px; } .info { text-align: center; padding: 60px 20px; } .info h1 { margin-bottom: 20px; } .info a { color: #ff6b35; text-decoration: none; }</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>🔖 EasyRead Sync</h1></div>
    <div class="info">
      <h1>EasyRead Sync Backend</h1>
      <p>API is running at <code>/api</code></p>
      <p style="margin-top: 20px;"><a href="https://github.com/volnet/chrome-extensions-easyread" target="_blank">View Extension →</a></p>
      <p style="margin-top: 10px;"><a href="/api">API Documentation →</a></p>
    </div>
  </div>
</body>
</html>`);
});

// API Info
app.get('/api', (c) => {
  return jsonResponse({
    name: 'EasyRead Sync API',
    version: '1.0.0',
    status: 'healthy',
    endpoints: {
      auth: '/api/auth/login, /api/auth/register',
      readLater: '/api/read-later',
      notes: '/api/notes',
      records: '/api/records',
      snapshots: '/api/snapshots',
      sync: '/api/sync/full, /api/sync/pull'
    }
  });
});

app.get('/health', (c) => {
  return jsonResponse({ status: 'ok' });
});

// 公开路由（无需认证）
app.route('/api/auth', auth);

// 需要认证的路由
app.use('/api/*', authMiddleware);
app.route('/api/read-later', readLater);
app.route('/api/notes', notes);
app.route('/api/records', records);
app.route('/api/sync', sync);
app.route('/api/snapshots', snapshots);

// 404 处理
app.notFound((c) => {
  return jsonResponse(
    { error: 'NOT_FOUND', message: 'Endpoint not found' },
    404
  );
});

// 错误处理
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return jsonResponse(
    { error: 'INTERNAL_ERROR', message: 'Internal server error' },
    500
  );
});

export default app;
