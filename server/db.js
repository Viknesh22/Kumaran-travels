const { createClient } = require('@libsql/client');
const path = require('path');

const DB_PATH = path.join(__dirname, 'kumaran_travels.db');

let db = null;

// Wrapper to make @libsql/client API similar to the previous sql.js / better-sqlite3 pattern
class Statement {
  constructor(client, sql) {
    this.client = client;
    this.sql = sql;
  }

  async get(...params) {
    const result = await this.client.execute({
      sql: this.sql,
      args: params.length > 0 ? params : undefined,
    });
    return result.rows[0] || undefined;
  }

  async all(...params) {
    const result = await this.client.execute({
      sql: this.sql,
      args: params.length > 0 ? params : undefined,
    });
    return result.rows;
  }

  async run(...params) {
    const result = await this.client.execute({
      sql: this.sql,
      args: params.length > 0 ? params : undefined,
    });
    return {
      lastInsertRowid: Number(result.lastInsertRowid || 0),
      changes: result.rowsAffected || 0,
    };
  }
}

class Database {
  constructor(client) {
    this.client = client;
  }

  prepare(sql) {
    return new Statement(this.client, sql);
  }

  async exec(sql) {
    await this.client.execute(sql);
  }

  transaction(fn) {
    return async (...args) => {
      await this.client.execute('BEGIN');
      try {
        const result = await fn(...args);
        await this.client.execute('COMMIT');
        return result;
      } catch (err) {
        await this.client.execute('ROLLBACK');
        throw err;
      }
    };
  }

  async close() {
    // @libsql/client doesn't need explicit close for local mode
  }
}

function createTursoClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    // Remote Turso database
    return createClient({ url, authToken });
  }

  // Local SQLite file (development mode)
  // @libsql/client on Windows requires forward slashes in the file: URL
  // Format: file:C:/path/to/db (NOT file:///C:/...)
  const normalizedPath = DB_PATH.replace(/\\/g, '/');
  return createClient({ url: `file:${normalizedPath}` });
}

async function initTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('owner', 'partner', 'driver')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_number TEXT UNIQUE NOT NULL,
      vehicle_name TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      capacity INTEGER DEFAULT 12,
      mileage_kmpl REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      vehicle_id INTEGER NOT NULL,
      driver_id INTEGER,
      partner_id INTEGER,
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
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (driver_id) REFERENCES users(id),
      FOREIGN KEY (partner_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      place_name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      stop_order INTEGER NOT NULL,
      stop_type TEXT DEFAULT 'stop' CHECK(stop_type IN ('start', 'stop', 'end')),
      is_return_trip INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS trip_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      expense_type TEXT NOT NULL CHECK(expense_type IN ('diesel', 'parking', 'toll', 'maintenance', 'food', 'other')),
      amount REAL NOT NULL,
      liters REAL,
      description TEXT,
      receipt_url TEXT,
      paid_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      payer_type TEXT NOT NULL CHECK(payer_type IN ('customer', 'driver', 'partner')),
      amount REAL NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('advance', 'balance', 'diesel_refill', 'other')),
      description TEXT,
      received_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (received_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      cost REAL NOT NULL,
      maintenance_date DATE NOT NULL,
      next_maintenance_km INTEGER,
      current_km_reading INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS diesel_refills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      liters REAL NOT NULL,
      amount REAL NOT NULL,
      rate_per_liter REAL,
      filled_by INTEGER,
      filled_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (filled_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notification_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER,
      recipient_type TEXT NOT NULL CHECK(recipient_type IN ('driver', 'partner', 'owner', 'customer')),
      recipient_email TEXT NOT NULL,
      notification_type TEXT NOT NULL CHECK(notification_type IN ('trip_confirmation', 'trip_reminder', 'payment_receipt', 'test')),
      subject TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
      error_message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
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
  } catch (e) { /* ignore if already exist */ }

  // Add columns that might be missing from existing databases
  const addColumnIfMissing = async (table, column, def) => {
    try {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    } catch (e) { /* column already exists */ }
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
  await addColumnIfMissing('trips', 'pending_collected_at', 'DATETIME');
}

let initPromise = null;

function initDb() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const client = createTursoClient();
    db = new Database(client);

    await db.exec('PRAGMA foreign_keys = ON');
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
