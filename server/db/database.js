// db/database.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

export async function initDatabase() {
  db = await open({
    filename: './db/sessions.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_sessions (
      player_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

export async function getPlayerSession(playerId) {
  return await db.get(
    'SELECT player_id, name FROM player_sessions WHERE player_id = ?',
    playerId
  );
}

export async function createPlayerSession(playerId, name) {
  await db.run(
    'INSERT INTO player_sessions (player_id, name) VALUES (?, ?)',
    [playerId, name]
  );
}

export async function updatePlayerName(playerId, newName) {
  await db.run(
    'UPDATE player_sessions SET name = ? WHERE player_id = ?',
    [newName, playerId]
  );
}

