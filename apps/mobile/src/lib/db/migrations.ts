import type { SQLiteDatabase } from 'expo-sqlite';
import { LATEST_SCHEMA_VERSION, MIGRATION_1_SQL } from './schema';

/**
 * Idempotently bring the database up to LATEST_SCHEMA_VERSION.
 *
 * Uses SQLite's built-in `PRAGMA user_version` as the version counter. Safe to
 * call multiple times: if user_version is already at the latest, it's a no-op.
 *
 * Each migration:
 *   1. Runs its DDL via execAsync (multi-statement safe).
 *   2. Bumps user_version atomically after success.
 * If the process crashes mid-migration, the CREATE IF NOT EXISTS pattern in
 * MIGRATION_1_SQL makes re-running the same migration harmless.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= LATEST_SCHEMA_VERSION) {
    return;
  }

  if (currentVersion < 1) {
    await db.execAsync(MIGRATION_1_SQL);
  }

  // PRAGMA user_version does not accept bound parameters, so inline the literal.
  await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION}`);
}
