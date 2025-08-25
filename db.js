// db.js
import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      lesson TEXT NOT NULL
    );
  `);
}

export async function upsertLessons(lessons) {
  // simple wipe-and-replace pattern
  await pool.query('DELETE FROM lessons');
  for (const l of lessons) {
    await pool.query('INSERT INTO lessons (lesson) VALUES ($1)', [l]);
  }
}

export async function getLessons() {
  const res = await pool.query('SELECT lesson FROM lessons ORDER BY id');
  return res.rows.map(r => r.lesson);
}
