const { Pool } = require('pg');

let db = null;

// Convert ? placeholders to $1, $2, ... for PostgreSQL
function convertPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// Detect if SQL is an INSERT (to auto-append RETURNING id for lastInsertRowid)
function isInsertQuery(sql) {
  return /^\s*INSERT\s/i.test(sql);
}

class Statement {
  constructor(database, originalSql) {
    this.db = database;
    this.originalSql = originalSql;
    this.pgSql = convertPlaceholders(originalSql);
    this.inserting = isInsertQuery(originalSql);
  }

  async get(...params) {
    const sql = this.inserting ? `${this.pgSql} RETURNING *` : this.pgSql;
    const cleanParams = params.map(p => (p === undefined ? null : p));
    const result = await this.db._query(sql, cleanParams);
    return result.rows[0] || undefined;
  }

  async all(...params) {
    const cleanParams = params.map(p => (p === undefined ? null : p));
    const result = await this.db._query(this.pgSql, cleanParams);
    return result.rows;
  }

  async run(...params) {
    const cleanParams = params.map(p => (p === undefined ? null : p));
    if (this.inserting) {
      const result = await this.db._query(`${this.pgSql} RETURNING id`, cleanParams);
      return {
        lastInsertRowid: result.rows[0]?.id || 0,
        changes: result.rowCount,
      };
    }
    const result = await this.db._query(this.pgSql, cleanParams);
    return {
      lastInsertRowid: 0,
      changes: result.rowCount,
    };
  }
}

class Database {
  constructor(pool) {
    this.pool = pool;
    this._txClient = null;
  }

  _getClient() {
    return this._txClient || this.pool;
  }

  async _query(sql, params) {
    const client = this._getClient();
    return client.query(sql, params);
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  async exec(sql) {
    await this._query(sql);
  }

  transaction(fn) {
    return async (...args) => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const prevClient = this._txClient;
        this._txClient = client;
        try {
          const result = await fn(...args);
          await client.query('COMMIT');
          return result;
        } finally {
          this._txClient = prevClient;
        }
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    };
  }

  async close() {
    await this.pool.end();
  }
}

function createPool() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (url) {
    const isRemote = !url.includes('localhost') && !url.includes('127.0.0.1');
    return new Pool({
      connectionString: url,
      ssl: isRemote ? { rejectUnauthorized: false } : false,
    });
  }
  // Local PostgreSQL fallback
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'kumaran_travels',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '',
  });
}

async function initTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('owner', 'partner', 'driver')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      registration_number TEXT UNIQUE NOT NULL,
      vehicle_name TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      capacity INTEGER DEFAULT 12,
      mileage_kmpl REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
      driver_id INTEGER REFERENCES users(id),
      partner_id INTEGER REFERENCES users(id),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT DEFAULT 'planned' CHECK(status IN ('planned', 'ongoing', 'completed', 'cancelled')),
      total_distance_km REAL DEFAULT 0,
      start_km_reading INTEGER,
      end_km_reading INTEGER,
      total_rent REAL DEFAULT 0,
      advance_amount REAL DEFAULT 0,
      balance_amount REAL DEFAULT 0,
      diesel_required_est REAL DEFAULT 0,
      diesel_used_liters REAL DEFAULT 0,
      mileage REAL DEFAULT 0,
      start_location TEXT,
      end_location TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS trip_stops (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      place_name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      stop_order INTEGER NOT NULL,
      stop_type TEXT DEFAULT 'stop' CHECK(stop_type IN ('start', 'stop', 'end')),
      is_return_trip INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS trip_expenses (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      expense_type TEXT NOT NULL CHECK(expense_type IN ('diesel', 'parking', 'toll', 'maintenance', 'food', 'other')),
      amount REAL NOT NULL,
      liters REAL,
      description TEXT,
      receipt_url TEXT,
      paid_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      payer_type TEXT NOT NULL CHECK(payer_type IN ('customer', 'driver', 'partner')),
      amount REAL NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('advance', 'balance', 'diesel_refill', 'other')),
      description TEXT,
      received_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS maintenance_logs (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
      description TEXT NOT NULL,
      cost REAL NOT NULL,
      maintenance_date DATE NOT NULL,
      next_maintenance_km INTEGER,
      current_km_reading INTEGER,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS diesel_refills (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      liters REAL NOT NULL,
      amount REAL NOT NULL,
      rate_per_liter REAL,
      filled_by INTEGER REFERENCES users(id),
      filled_by_name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notification_settings (
      id SERIAL PRIMARY KEY,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications_log (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      recipient_type TEXT NOT NULL CHECK(recipient_type IN ('driver', 'partner', 'owner', 'customer')),
      recipient_email TEXT NOT NULL,
      notification_type TEXT NOT NULL CHECK(notification_type IN ('trip_confirmation', 'trip_reminder', 'payment_receipt', 'test')),
      subject TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
      error_message TEXT,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const sql of tables) {
    await db.exec(sql);
  }

  // Create indexes
  try {
    await db.exec('CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status)');
  } catch (e) { /* indexes may already exist */ }

  // Add columns that might be missing (safe to ignore errors)
  const addColumnIfMissing = async (table, column, def) => {
    try {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${def}`);
    } catch (e) { /* column already exists or ALTER not supported */ }
  };

  await addColumnIfMissing('vehicles', 'mileage_kmpl', 'REAL DEFAULT 0');
  await addColumnIfMissing('trips', 'diesel_rate_used', 'REAL DEFAULT 90');
  await addColumnIfMissing('trips', 'estimated_diesel_cost', 'REAL DEFAULT 0');
  await addColumnIfMissing('diesel_refills', 'rate_per_liter', 'REAL');
  await addColumnIfMissing('diesel_refills', 'filled_by_name', 'TEXT');
  await addColumnIfMissing('trips', 'driver_starting_cash', 'REAL DEFAULT 0');
  await addColumnIfMissing('trips', 'driver_cash_collected', 'REAL DEFAULT 0');
  await addColumnIfMissing('trips', 'driver_total_spent', 'REAL DEFAULT 0');
  await addColumnIfMissing('trips', 'pending_amount', 'REAL DEFAULT 0');
  await addColumnIfMissing('trips', 'pending_amount_collected', 'REAL DEFAULT 0');
  await addColumnIfMissing('trips', 'pending_collected_by', 'INTEGER');
  await addColumnIfMissing('trips', 'pending_collected_at', 'TIMESTAMP');
}

let initPromise = null;

function initDb() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const pool = createPool();
    db = new Database(pool);

    await initTables();

    return db;
  })();

  return initPromise;
}

async function getDb() {
  if (!db) {
    await initDb();
  }
  return db;
}

module.exports = { getDb };
