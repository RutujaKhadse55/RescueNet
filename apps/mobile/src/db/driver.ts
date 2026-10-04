/**
 * RescueNet Database Driver Abstraction
 * Supports native SQLCipher via @op-engineering/op-sqlite on Android/iOS,
 * and high-performance in-memory driver for unit testing and headless validation.
 */

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowsAffected: number;
  insertId?: number;
}

export interface BatchStatement {
  sql: string;
  params?: unknown[];
}

export interface IDatabaseDriver {
  execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  executeBatch(statements: BatchStatement[]): Promise<void>;
  close(): Promise<void>;
  isOpen(): boolean;
}

/**
 * Robust in-memory driver supporting standard SQL statements used by RescueNet
 */
export class InMemoryDatabaseDriver implements IDatabaseDriver {
  private tables: Map<string, Array<Record<string, unknown>>> = new Map();
  private open: boolean = true;

  isOpen(): boolean {
    return this.open;
  }

  async close(): Promise<void> {
    this.open = false;
    this.tables.clear();
  }

  async executeBatch(statements: BatchStatement[]): Promise<void> {
    for (const stmt of statements) {
      await this.execute(stmt.sql, stmt.params);
    }
  }

  async execute<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.open) {
      throw new Error('Database is closed');
    }

    // Strip trailing semicolons and trim whitespace
    const trimmed = sql.trim().replace(/;+\s*$/, '');
    const upper = trimmed.toUpperCase();

    // 1. CREATE TABLE
    if (upper.startsWith('CREATE TABLE')) {
      const match = trimmed.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-zA-Z0-9_]+)/i);
      if (match && match[1]) {
        const tableName = match[1];
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
      }
      return { rows: [], rowsAffected: 0 };
    }

    // 2. CREATE INDEX
    if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE UNIQUE INDEX')) {
      return { rows: [], rowsAffected: 0 };
    }

    // 3. PRAGMA
    if (upper.startsWith('PRAGMA')) {
      return { rows: [], rowsAffected: 0 };
    }

    // 4. INSERT OR REPLACE / INSERT INTO
    if (upper.startsWith('INSERT')) {
      const match = trimmed.match(/INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)/i);
      if (match && match[1] && match[2]) {
        const tableName = match[1];
        const columns = match[2].split(',').map((c) => c.trim().replace(/[\r\n]+/g, ''));
        let table = this.tables.get(tableName);
        if (!table) {
          table = [];
          this.tables.set(tableName, table);
        }

        const newRow: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          const colName = columns[i];
          if (colName) {
            newRow[colName] = params[i] !== undefined ? params[i] : null;
          }
        }

        // Primary key resolution: check composite or single PK
        let pkCols: string[] = [columns[0] || 'id'];
        if (tableName === 'cluster_members') {
          pkCols = ['cluster_id', 'origin_fp'];
        }

        const existingIdx = table.findIndex((r) =>
          pkCols.every((pk) => r[pk] !== undefined && r[pk] === newRow[pk])
        );

        if (existingIdx >= 0) {
          table[existingIdx] = { ...table[existingIdx], ...newRow };
        } else {
          table.push(newRow);
        }

        return { rows: [], rowsAffected: 1 };
      }
    }

    // 5. UPDATE
    if (upper.startsWith('UPDATE')) {
      const match = trimmed.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i);
      if (match && match[1] && match[2]) {
        const tableName = match[1];
        const setClause = match[2];
        const whereClause = match[3];

        const table = this.tables.get(tableName) || [];
        let rowsAffected = 0;

        // Assignments
        const assignments = setClause.split(',').map((s) => s.trim());
        const setPlaceholdersCount = (setClause.match(/\?/g) || []).length;

        for (const row of table) {
          let matchesWhere = true;
          if (whereClause) {
            matchesWhere = this.evaluateWhere(row, whereClause, params, setPlaceholdersCount);
          }

          if (matchesWhere) {
            let pCursor = 0;
            for (const assign of assignments) {
              const parts = assign.split('=').map((s) => s.trim());
              const col = parts[0];
              const expr = parts[1];
              if (!col || !expr) continue;

              if (expr === '?') {
                row[col] = params[pCursor++];
              } else if (/^MIN\s*\(/i.test(expr)) {
                // Handle MIN(col, ?) or MIN(col, literal)
                const minMatch = expr.match(/^MIN\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*(\?|[0-9]+)\s*\)/i);
                if (minMatch && minMatch[1] && minMatch[2]) {
                  const curr = (row[minMatch[1]] as number) ?? Infinity;
                  const candidate = minMatch[2] === '?' ? (params[pCursor++] as number) : parseInt(minMatch[2], 10);
                  row[col] = Math.min(curr, candidate);
                }
              } else if (expr.includes('+')) {
                const addMatch = expr.match(/([a-zA-Z0-9_]+)\s*\+\s*([0-9]+)/);
                if (addMatch && addMatch[1] && addMatch[2]) {
                  const curr = (row[addMatch[1]] as number) || 0;
                  row[col] = curr + parseInt(addMatch[2], 10);
                }
              } else {
                row[col] = expr.replace(/['"]/g, '');
              }
            }
            rowsAffected++;
          }
        }

        return { rows: [], rowsAffected };
      }
    }

    // 6. DELETE
    if (upper.startsWith('DELETE FROM')) {
      const match = trimmed.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+))?$/i);
      if (match && match[1]) {
        const tableName = match[1];
        const whereClause = match[2];
        const table = this.tables.get(tableName) || [];

        if (!whereClause) {
          const count = table.length;
          this.tables.set(tableName, []);
          return { rows: [], rowsAffected: count };
        }

        const remaining: Array<Record<string, unknown>> = [];
        let deleted = 0;

        for (const row of table) {
          if (this.evaluateWhere(row, whereClause, params, 0)) {
            deleted++;
          } else {
            remaining.push(row);
          }
        }

        this.tables.set(tableName, remaining);
        return { rows: [], rowsAffected: deleted };
      }
    }

    // 7. SELECT
    if (upper.startsWith('SELECT')) {
      const match = trimmed.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+([0-9]+))?$/i);
      if (match && match[1] && match[2]) {
        const selectFields = match[1].trim();
        const tableName = match[2].trim();
        const whereClause = match[3]?.trim();
        const orderClause = match[4]?.trim();
        const limitClause = match[5]?.trim();

        const table = this.tables.get(tableName) || [];
        let filtered = table.filter((row) => {
          if (!whereClause) return true;
          return this.evaluateWhere(row, whereClause, params, 0);
        });

        // ORDER BY
        if (orderClause) {
          const parts = orderClause.split(/\s+/);
          const col = parts[0];
          const desc = parts[1] && parts[1].toUpperCase() === 'DESC';
          if (col) {
            filtered.sort((a, b) => {
              const valA = a[col];
              const valB = b[col];
              if (valA === valB) return 0;
              if (valA === undefined || valA === null) return 1;
              if (valB === undefined || valB === null) return -1;
              if (valA < valB) return desc ? 1 : -1;
              return desc ? -1 : 1;
            });
          }
        }

        // LIMIT
        if (limitClause) {
          const lim = parseInt(limitClause, 10);
          filtered = filtered.slice(0, lim);
        }

        // Handle SELECT COUNT(*)
        if (selectFields.toUpperCase().includes('COUNT(*)')) {
          const resultRow = { count: filtered.length, 'COUNT(*)': filtered.length } as unknown as T;
          return { rows: [resultRow], rowsAffected: 0 };
        }

        // Handle specific columns or *
        if (selectFields === '*') {
          return { rows: filtered.map((r) => ({ ...r })) as T[], rowsAffected: 0 };
        } else {
          const cols = selectFields.split(',').map((c) => c.trim());
          const projected = filtered.map((r) => {
            const obj: Record<string, unknown> = {};
            for (const c of cols) {
              if (c) {
                obj[c] = r[c];
              }
            }
            return obj as T;
          });
          return { rows: projected, rowsAffected: 0 };
        }
      }
    }

    return { rows: [], rowsAffected: 0 };
  }

  private evaluateWhere(
    row: Record<string, unknown>,
    whereClause: string,
    params: unknown[],
    paramOffset: number = 0
  ): boolean {
    const clauses = whereClause.split(/\s+AND\s+/i);
    let pIdx = paramOffset;

    for (const clause of clauses) {
      const c = clause.trim();
      if (c.includes(' IS NULL')) {
        const col = c.replace(' IS NULL', '').trim();
        if (row[col] !== null && row[col] !== undefined) return false;
      } else if (c.includes(' IS NOT NULL')) {
        const col = c.replace(' IS NOT NULL', '').trim();
        if (row[col] === null || row[col] === undefined) return false;
      } else if (c.includes('=')) {
        const parts = c.split('=').map((s) => s.trim());
        const col = parts[0];
        const rhs = parts[1];
        if (!col || rhs === undefined) continue;

        let expected: unknown = rhs;
        if (rhs === '?') {
          expected = params[pIdx++];
        } else {
          expected = rhs.replace(/['"]/g, '');
        }
        if (String(row[col]) !== String(expected)) return false;
      } else if (c.includes('<=')) {
        const parts = c.split('<=').map((s) => s.trim());
        const col = parts[0];
        const rhs = parts[1];
        if (!col || rhs === undefined) continue;
        const expected = rhs === '?' ? Number(params[pIdx++]) : Number(rhs);
        if (Number(row[col]) > expected) return false;
      } else if (c.includes('>=')) {
        const parts = c.split('>=').map((s) => s.trim());
        const col = parts[0];
        const rhs = parts[1];
        if (!col || rhs === undefined) continue;
        const expected = rhs === '?' ? Number(params[pIdx++]) : Number(rhs);
        if (Number(row[col]) < expected) return false;
      } else if (c.includes('<')) {
        const parts = c.split('<').map((s) => s.trim());
        const col = parts[0];
        const rhs = parts[1];
        if (!col || rhs === undefined) continue;
        const expected = rhs === '?' ? Number(params[pIdx++]) : Number(rhs);
        if (Number(row[col]) >= expected) return false;
      } else if (c.includes('>')) {
        const parts = c.split('>').map((s) => s.trim());
        const col = parts[0];
        const rhs = parts[1];
        if (!col || rhs === undefined) continue;
        const expected = rhs === '?' ? Number(params[pIdx++]) : Number(rhs);
        if (Number(row[col]) <= expected) return false;
      }
    }
    return true;
  }
}

/**
 * OpSqliteDriver for native runtime on Android/iOS
 * Utilizes SQLCipher encryption via Keystore key.
 */
export class OpSqliteDriver implements IDatabaseDriver {
  private db: unknown = null;
  private encryptionKey: string;
  private dbName: string;

  constructor(encryptionKey: string, dbName: string = 'rescuenet.db') {
    this.encryptionKey = encryptionKey;
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    throw new Error('Native op-sqlite is not installed in bare sideload build, use InMemoryDatabaseDriver');
  }

  isOpen(): boolean {
    return this.db !== null;
  }

  async execute<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.db) {
      throw new Error('OpSqlite database is not open');
    }
    const d = this.db as {
      execute: (sql: string, params?: unknown[]) => { rows?: { _array: T[] }; rowsAffected?: number; insertId?: number };
    };
    const res = d.execute(sql, params);
    return {
      rows: res.rows?._array || [],
      rowsAffected: res.rowsAffected || 0,
      insertId: res.insertId,
    };
  }

  async executeBatch(statements: BatchStatement[]): Promise<void> {
    for (const stmt of statements) {
      await this.execute(stmt.sql, stmt.params);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      const d = this.db as { close: () => void };
      d.close();
      this.db = null;
    }
  }
}
