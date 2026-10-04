import { IDatabaseDriver } from './driver';
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL } from './schema';

export interface Migration {
  version: number;
  name: string;
  up: (driver: IDatabaseDriver) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_offline_mesh_schema',
    up: async (driver: IDatabaseDriver) => {
      // Create migration tracking table
      await driver.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
      `);

      // Create core tables
      for (const ddl of CREATE_TABLES_SQL) {
        await driver.execute(ddl);
      }

      // Create indexes
      for (const idx of CREATE_INDEXES_SQL) {
        await driver.execute(idx);
      }
    },
  },
];

export async function runMigrations(driver: IDatabaseDriver): Promise<void> {
  // Ensure schema_migrations table exists
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRes = await driver.execute<{ version: number }>(`
    SELECT version FROM schema_migrations ORDER BY version ASC;
  `);
  const appliedVersions = new Set(appliedRes.rows.map(r => r.version));

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      await m.up(driver);
      await driver.execute(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);`, [
        m.version,
        new Date().toISOString(),
      ]);
    }
  }
}
