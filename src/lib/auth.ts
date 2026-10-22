// JWT 认证工具
import type { Env, JWTPayload } from '../types';

// 简化版 JWT 实现（生产环境建议用成熟库如 @tsndr/cloudflare-worker-jwt）
export async function generateToken(userId: string, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    user_id: userId,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 天
  }));
  
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return `${data}.${signatureBase64}`;
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, payload, signature] = parts;
    const data = `${header}.${payload}`;
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(data));
    
    if (!valid) return null;
    
    const payloadData: JWTPayload = JSON.parse(atob(payload));
    
    // 检查过期时间
    if (payloadData.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return payloadData;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): Promise<string> {
  // 简化实现，生产环境应使用 bcrypt 或 scrypt
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    .then(hash => btoa(String.fromCharCode(...new Uint8Array(hash))));
}
