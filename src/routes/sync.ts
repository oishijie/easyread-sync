// Sync Routes (全量同步)
import { Hono } from 'hono';
import type { Env } from '../types';
import { createReadLater, createNote, syncAllRecords } from '../lib/db';
import { errorResponse, jsonResponse } from '../lib/cors';

const sync = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// 全量同步（上传本地所有数据）
sync.post('/full', async (c) => {
  try {
    const userId = c.get('userId');
    const { readLaters, allRecords, notes } = await c.req.json();
    
    const now = Date.now();
    let syncedCount = 0;
    
    // 同步稍后阅读
    if (Array.isArray(readLaters)) {
      for (const item of readLaters) {
        try {
          await createReadLater(c.env.DB, userId, item);
          syncedCount++;
        } catch (e) {
          console.error('Failed to sync read later:', e);
        }
      }
    }
    
    // 同步访问记录
    if (allRecords && typeof allRecords === 'object') {
      syncedCount += await syncAllRecords(c.env.DB, userId, allRecords);
    }
    
    // 同步笔记
    if (notes && typeof notes === 'object') {
      for (const [url, page] of Object.entries(notes)) {
        try {
          if (Array.isArray((page as any).notes)) {
            for (const note of (page as any).notes) {
              await createNote(c.env.DB, userId, url, (page as any).title, note);
              syncedCount++;
            }
          }
        } catch (e) {
          console.error('Failed to sync notes:', e);
        }
      }
    }
    
    // 更新同步元数据
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO sync_metadata (user_id, last_sync_at, version)
      VALUES (?, ?, 1)
    `).bind(userId, now).run();
    
    return jsonResponse({
      synced: true,
      syncedAt: now,
      syncedCount
    });
    
  } catch (error) {
    console.error('Full sync error:', error);
    return errorResponse('SERVER_ERROR', 'Failed to sync data', 500);
  }
});

// 拉取云端数据
sync.get('/pull', async (c) => {
  try {
    const userId = c.get('userId');
    const since = parseInt(c.req.query('since') || '0');
    
    // 获取所有数据
    const readLatersResult = await c.env.DB.prepare(
      'SELECT * FROM read_laters WHERE user_id = ? AND synced_at > ?'
    ).bind(userId, since).all();
    
    const recordsResult = await c.env.DB.prepare(
      'SELECT * FROM all_records WHERE user_id = ? AND synced_at > ?'
    ).bind(userId, since).all();
    
    const notesResult = await c.env.DB.prepare(`
      SELECT n.*, np.url, np.title 
      FROM notes n
      JOIN notes_pages np ON n.page_id = np.id
      WHERE n.user_id = ? AND n.synced_at > ?
    `).bind(userId, since).all();
    
    // 构造响应格式
    const allRecords: Record<string, any> = {};
    for (const record of recordsResult.results || []) {
      allRecords[(record as any).url] = {
        url: (record as any).url,
        title: (record as any).title,
        datetime: JSON.parse((record as any).datetime || '[]')
      };
    }
    
    const notes: Record<string, any> = {};
    for (const note of notesResult.results || []) {
      const url = (note as any).url;
      if (!notes[url]) {
        notes[url] = {
          url: (note as any).url,
          title: (note as any).title,
          notes: []
        };
      }
      notes[url].notes.push({
        id: (note as any).note_id,
        scope: (note as any).scope,
        selectionText: (note as any).selection_text,
        comment: (note as any).comment,
        author: (note as any).author,
        createDateTime: (note as any).create_datetime
      });
    }
    
    return jsonResponse({
      readLaters: readLatersResult.results || [],
      allRecords,
      notes,
      deletedIds: { readLaters: [], notes: [] },
      syncedAt: Date.now()
    });
    
  } catch (error) {
    console.error('Pull sync error:', error);
    return errorResponse('SERVER_ERROR', 'Failed to pull data', 500);
  }
});

export default sync;
