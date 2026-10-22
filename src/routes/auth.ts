// Auth Routes
import { Hono } from 'hono';
import type { Env } from '../types';
import { generateToken, hashPassword } from '../lib/auth';
import { generateId } from '../lib/db';
import { errorResponse, jsonResponse } from '../lib/cors';

const auth = new Hono<{ Bindings: Env }>();

// 注册
auth.post('/register', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return errorResponse('INVALID_REQUEST', 'Email and password required', 400);
    }
    
    // 检查用户是否已存在
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email).first();
    
    if (existing) {
      return errorResponse('CONFLICT', 'User already exists', 409);
    }
    
    // 创建用户
    const userId = generateId();
    const passwordHash = await hashPassword(password);
    const now = Date.now();
    
    await c.env.DB.prepare(`
      INSERT INTO users (id, email, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(userId, email, now, now).run();
    
    // 生成 token
    const token = await generateToken(userId, c.env.JWT_SECRET);
    
    return jsonResponse({
      token,
      user_id: userId
    }, 201);
    
  } catch (error) {
    console.error('Register error:', error);
    return errorResponse('SERVER_ERROR', 'Registration failed', 500);
  }
});

// 登录
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return errorResponse('INVALID_REQUEST', 'Email and password required', 400);
    }
    
    const passwordHash = await hashPassword(password);
    
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email).first();
    
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Invalid credentials', 401);
    }
    
    // 生成 token
    const token = await generateToken(user.id as string, c.env.JWT_SECRET);
    
    return jsonResponse({
      token,
      user_id: user.id
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('SERVER_ERROR', 'Login failed', 500);
  }
});

export default auth;
