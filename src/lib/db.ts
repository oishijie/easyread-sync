// 数据库工具函数
import type { Env, ReadLater, AllRecord, NotesPage, Note } from '../types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function normalizePageUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  return url.split('#')[0].toLowerCase().trim();
}

// ReadLater 数据库操作
export async function getReadLaters(db: D1Database, userId: string, status?: number, limit = 50, offset = 0) {
  let query = 'SELECT * FROM read_laters WHERE user_id = ?';
  const params: any[] = [userId];
  
  if (status !== undefined) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY create_datetime DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const result = await db.prepare(query).bind(...params).all();
  
  const items = result.results?.map(row => parseReadLater(row)) || [];
  
  // 获取总数
  let countQuery = 'SELECT COUNT(*) as total FROM read_laters WHERE user_id = ?';
  const countParams: any[] = [userId];
  if (status !== undefined) {
    countQuery += ' AND status = ?';
    countParams.push(status);
  }
  const countResult = await db.prepare(countQuery).bind(...countParams).first();
  
  return {
    items,
    total: countResult?.total || 0
  };
}

export async function createReadLater(db: D1Database, userId: string, data: Partial<ReadLater>) {
  const id = generateId();
  const now = Date.now();
  
  await db.prepare(`
    INSERT INTO read_laters (id, user_id, key, url, title, create_datetime, status, 
      position_progress, position_scroll_x, position_scroll_y, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, data.key, data.url, data.title, data.create_datetime || now,
    data.status || 0,
    data.position?.progress, data.position?.scrollX, data.position?.scrollY,
    now
  ).run();
  
  return id;
}

export async function updateReadLater(db: D1Database, userId: string, id: string, data: Partial<ReadLater>) {
  const now = Date.now();
  
  await db.prepare(`
    UPDATE read_laters 
    SET status = COALESCE(?, status),
        position_progress = ?,
        position_scroll_x = ?,
        position_scroll_y = ?,
        synced_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    data.status,
    data.position?.progress, data.position?.scrollX, data.position?.scrollY,
    now, id, userId
  ).run();
}

export async function deleteReadLater(db: D1Database, userId: string, id: string) {
  await db.prepare('DELETE FROM read_laters WHERE id = ? AND user_id = ?')
    .bind(id, userId).run();
}

// AllRecords 数据库操作
export async function syncAllRecords(db: D1Database, userId: string, records: Record<string, any>) {
  const now = Date.now();
  let synced = 0;
  
  for (const [url, record] of Object.entries(records)) {
    const id = generateId();
    
    await db.prepare(`
      INSERT OR REPLACE INTO all_records 
      (id, user_id, url, title, datetime, position_progress, position_scroll_x, position_scroll_y, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, userId, record.url, record.title,
      JSON.stringify(record.datetime || []),
      record.position?.progress, record.position?.scrollX, record.position?.scrollY,
      now
    ).run();
    
    synced++;
  }
  
  return synced;
}

// Notes 数据库操作
export async function getNotesPages(db: D1Database, userId: string, limit = 50, offset = 0) {
  const result = await db.prepare(`
    SELECT np.*, COUNT(n.id) as notes_count
    FROM notes_pages np
    LEFT JOIN notes n ON np.id = n.page_id
    WHERE np.user_id = ?
    GROUP BY np.id
    ORDER BY np.create_datetime DESC
    LIMIT ? OFFSET ?
  `).bind(userId, limit, offset).all();
  
  const countResult = await db.prepare('SELECT COUNT(*) as total FROM notes_pages WHERE user_id = ?')
    .bind(userId).first();
  
  return {
    pages: result.results || [],
    total: countResult?.total || 0
  };
}

export async function getPageNotes(db: D1Database, userId: string, url: string) {
  const normalizedUrl = normalizePageUrl(url);
  
  const page = await db.prepare('SELECT * FROM notes_pages WHERE user_id = ? AND url = ?')
    .bind(userId, normalizedUrl).first();
  
  if (!page) {
    return null;
  }
  
  const notes = await db.prepare('SELECT * FROM notes WHERE page_id = ? ORDER BY create_datetime')
    .bind(page.id).all();
  
  return {
    url: page.url,
    title: page.title,
    notes: notes.results?.map(row => parseNote(row)) || []
  };
}

export async function createNote(db: D1Database, userId: string, url: string, title: string, note: Partial<Note>) {
  const normalizedUrl = normalizePageUrl(url);
  const now = Date.now();
  
  // 确保 page 存在
  let page = await db.prepare('SELECT id FROM notes_pages WHERE user_id = ? AND url = ?')
    .bind(userId, normalizedUrl).first();
  
  if (!page) {
    const pageId = generateId();
    await db.prepare(`
      INSERT INTO notes_pages (id, user_id, url, title, create_datetime, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(pageId, userId, normalizedUrl, title, now, now).run();
    page = { id: pageId };
  }
  
  const noteId = generateId();
  await db.prepare(`
    INSERT INTO notes (id, page_id, user_id, note_id, scope, selection_text, comment, 
      author, prefix, suffix, text_position, create_datetime, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    noteId, page.id, userId, note.note_id || noteId, note.scope || 'text',
    note.selection_text, note.comment, note.author,
    note.prefix, note.suffix, note.text_position,
    note.create_datetime || now, now
  ).run();
  
  return noteId;
}

export async function deleteNote(db: D1Database, userId: string, noteId: string) {
  await db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .bind(noteId, userId).run();
}

// 解析函数
function parseReadLater(row: any): ReadLater {
  return {
    id: row.id,
    user_id: row.user_id,
    key: row.key,
    url: row.url,
    title: row.title,
    create_datetime: row.create_datetime,
    start_read_datetime: row.start_read_datetime,
    end_read_datetime: row.end_read_datetime,
    status: row.status,
    position: {
      progress: row.position_progress,
      scrollX: row.position_scroll_x,
      scrollY: row.position_scroll_y
    },
    synced_at: row.synced_at
  };
}

function parseNote(row: any): Note {
  return {
    id: row.id,
    page_id: row.page_id,
    user_id: row.user_id,
    note_id: row.note_id,
    scope: row.scope,
    selection_text: row.selection_text,
    comment: row.comment,
    author: row.author,
    prefix: row.prefix,
    suffix: row.suffix,
    text_position: row.text_position,
    create_datetime: row.create_datetime,
    updated_at: row.updated_at,
    synced_at: row.synced_at
  };
}
