import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrations';

/**
 * Lazy singleton around the Phase A expo-sqlite database.
 *
 * Why lazy + memoized promise:
 * - Opening the db at module import would run before the React tree mounts,
 *   which is fine on device but makes tsc and jest hermetic imports noisier.
 * - Memoizing the `runMigrations` promise guarantees migrations run exactly
 *   once per process even under concurrent first-callers.
 *
 * Per 43-RESEARCH.md Pitfall 3: this file intentionally avoids any top-level
 * await and does not import anything outside Expo Go's prebuilt set.
 */

const DB_NAME = 'morfx.db';

let dbInstance: SQLiteDatabase | null = null;
let migrationsPromise: Promise<void> | null = null;

/**
 * Returns the shared SQLiteDatabase instance. On first call, opens the db and
 * runs pending migrations. Subsequent calls await the same migration promise.
 */
export async function getDb(): Promise<SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = openDatabaseSync(DB_NAME);
  }
  if (!migrationsPromise) {
    migrationsPromise = (async () => {
      const db = dbInstance!;
      await runMigrations(db);
      const row = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version'
      );
      // eslint-disable-next-line no-console
      console.log('[db] user_version =', row?.user_version ?? 0);
    })();
  }
  await migrationsPromise;
  return dbInstance;
}

/**
 * Test/dev-only: reset the singleton so the next getDb() re-opens and re-runs
 * migrations. Not exported from the public barrel on purpose.
 */
export function __resetDbForTests(): void {
  dbInstance = null;
  migrationsPromise = null;
}
