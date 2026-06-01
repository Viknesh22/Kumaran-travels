const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const initSqlJs = require('sql.js');

const dashboardRouter = require('../routes/dashboard');
const { JWT_SECRET } = require('../middleware/auth');

// ── Mini Database wrapper (mirrors the pattern in server/db.js) ──
class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.stmt = null;
  }
  _prepare(params) {
    if (this.stmt) this.stmt.free();
    this.stmt = this.db.prepare(this.sql);
    if (params && params.length > 0) {
      this.stmt.bind(params);
    }
    return this.stmt;
  }
  async get(...params) {
    const stmt = this._prepare(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      this.stmt = null;
      return row;
    }
    stmt.free();
    this.stmt = null;
    return undefined;
  }
  async all(...params) {
    const stmt = this._prepare(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    this.stmt = null;
    return rows;
  }
  async run(...params) {
    const stmt = this._prepare(params);
    stmt.step();
    stmt.free();
    this.stmt = null;
    const lastRowResult = this.db.exec('SELECT last_insert_rowid() as id');
    const changesResult = this.db.exec('SELECT changes() as count');
    return {
      lastInsertRowid: lastRowResult[0]?.values[0]?.[0] || 0,
      changes: changesResult[0]?.values[0]?.[0] || 0,
    };
  }
}

class Database {
  constructor(sqlDb) {
    this._db = sqlDb;
  }
  prepare(sql) {
    return new Statement(this._db, sql);
  }
  exec(sql) {
    this._db.exec(sql);
  }
}

// ── Helper: create an in-memory database with test data ──
async function createTestDatabase() {
  const SQL = await initSqlJs();
  const rawDb = new SQL.Database();
  const db = new Database(rawDb);

  // Create tables (minimal set needed by the dashboard /stats endpoint)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('owner', 'partner', 'driver')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_number TEXT UNIQUE NOT NULL,
      vehicle_name TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      capacity INTEGER DEFAULT 12,
      mileage_kmpl REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      vehicle_id INTEGER NOT NULL,
      driver_id INTEGER,
      partner_id INTEGER,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT DEFAULT 'planned' CHECK(status IN ('planned', 'ongoing', 'completed', 'cancelled')),
      total_rent REAL DEFAULT 0,
      advance_amount REAL DEFAULT 0,
      balance_amount REAL DEFAULT 0,
      diesel_used_liters REAL DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS trip_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      expense_type TEXT NOT NULL CHECK(expense_type IN ('diesel', 'parking', 'toll', 'maintenance', 'food', 'other')),
      amount REAL NOT NULL,
      liters REAL,
      description TEXT,
      paid_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
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
    );

    CREATE TABLE IF NOT EXISTS maintenance_logs (
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
    );

    CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
  `);

  // ── Seed users ──
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)'
  );
  await insertUser.run('Owner', 'owner@test.com', 'hash', '1234567890', 'owner');
  await insertUser.run('Driver', 'driver@test.com', 'hash', '1234567891', 'driver');
  await insertUser.run('Partner', 'partner@test.com', 'hash', '1234567892', 'partner');

  // ── Seed vehicles ──
  const insertVehicle = db.prepare(
    'INSERT INTO vehicles (registration_number, vehicle_name, owner_id) VALUES (?, ?, ?)'
  );
  await insertVehicle.run('TN45AX0001', 'Test Vehicle', 1);

  // ── Derive current month/year so seed data is always "current" ──
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const thisMonth = String(now.getMonth() + 1).padStart(2, '0');

  // ── Seed trips for balance_due test ──
  // Trip 1: planned, balance 30 000          → should be counted
  // Trip 2: completed, balance 0             → should NOT be counted (balance = 0)
  // Trip 3: completed, balance 15 000        → should be counted
  // Trip 4: completed, balance NULL          → should NOT be counted (balance is NULL → COALESCE → 0)
  // Trip 5: cancelled, balance 5 000         → should NOT be counted (cancelled status excluded)
  // Trip 6: ongoing, balance 10 000          → should be counted
  // Expected balance_to_collect = 30 000 + 15 000 + 10 000 = 55 000
  const insertTrip = db.prepare(`
    INSERT INTO trips (title, vehicle_id, driver_id, start_date, end_date, status, total_rent, advance_amount, balance_amount, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await insertTrip.run('Planned with balance', 1, 2, `${thisYear}-${thisMonth}-10`, `${thisYear}-${thisMonth}-15`, 'planned', 50000, 20000, 30000, 1);
  await insertTrip.run('Completed zero balance', 1, 2, `${thisYear}-${thisMonth}-01`, `${thisYear}-${thisMonth}-05`, 'completed', 30000, 30000, 0, 1);
  await insertTrip.run('Completed with balance', 1, 2, `${thisYear}-${thisMonth}-10`, `${thisYear}-${thisMonth}-12`, 'completed', 25000, 10000, 15000, 1);
  await insertTrip.run('Completed NULL balance', 1, 2, `${thisYear}-${thisMonth}-01`, `${thisYear}-${thisMonth}-03`, 'completed', 5000, 5000, null, 1);
  await insertTrip.run('Cancelled with balance', 1, 2, `${thisYear}-${thisMonth}-01`, `${thisYear}-${thisMonth}-03`, 'cancelled', 10000, 5000, 5000, 1);
  await insertTrip.run('Ongoing with balance', 1, 2, `${thisYear}-${thisMonth}-01`, `${thisYear}-${thisMonth}-10`, 'ongoing', 20000, 10000, 10000, 1);

  // ── Seed trip_expenses for diesel_used test ──
  // Trip 1: diesel 45L → counted
  // Trip 3: diesel 20L → counted
  // Trip 3: toll (no liters) → NOT counted (expense_type != 'diesel')
  // Trip 6: diesel 15L → counted (ongoing trip's diesel still counts)
  // Expected diesel_used = 45 + 20 + 15 = 80
  const insertExpense = db.prepare(
    'INSERT INTO trip_expenses (trip_id, expense_type, amount, liters, description, paid_by) VALUES (?, ?, ?, ?, ?, ?)'
  );
  await insertExpense.run(1, 'diesel', 5850, 45, 'Diesel refill', 2);
  await insertExpense.run(3, 'diesel', 2600, 20, 'Diesel refill', 2);
  await insertExpense.run(3, 'toll', 350, null, 'Toll charges', 2);
  await insertExpense.run(6, 'diesel', 1950, 15, 'Diesel refill', 2);

  return db;
}

// ── Create a valid JWT for auth ──
function createOwnerToken() {
  return jwt.sign(
    { id: 1, email: 'owner@test.com', role: 'owner', name: 'Owner' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function createDriverToken() {
  return jwt.sign(
    { id: 2, email: 'driver@test.com', role: 'driver', name: 'Driver' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ── Tests ──
describe('Dashboard API — /stats endpoint', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    const testDb = await createTestDatabase();

    app = express();
    app.use(express.json());

    // Inject the test database (same pattern as server/index.js)
    app.use((req, res, next) => {
      req.db = testDb;
      next();
    });

    app.use('/api/dashboard', dashboardRouter);

    return new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  // ── Balance Due tests ──

  it('should include planned trips with positive balance in balance_to_collect', async () => {
    const token = createOwnerToken();
    const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Trip 1 (planned, 30 000) + Trip 3 (completed, 15 000) + Trip 6 (ongoing, 10 000) = 55 000
    assert.equal(data.total.balance_to_collect, 55000);
  });

  it('should exclude cancelled trips from balance_to_collect even if they have balance', async () => {
    const token = createOwnerToken();
    const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Trip 5 is cancelled (balance 5 000) — it is excluded.
    // If it were included, total would be 60 000.
    assert.notEqual(data.total.balance_to_collect, 60000);
    assert.equal(data.total.balance_to_collect, 55000);
  });

  it('should exclude trips with zero or NULL balance from balance_to_collect', async () => {
    const token = createOwnerToken();
    const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Trip 2 (balance=0) and Trip 4 (balance=NULL) are excluded
    assert.equal(data.total.balance_to_collect, 55000);
  });

  // ── Diesel Used tests ──

  it('should sum diesel liters from trip_expenses for the current year', async () => {
    const token = createOwnerToken();
    const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // 45 (Trip 1) + 20 (Trip 3) + 15 (Trip 6) = 80
    assert.equal(data.yearly.diesel_used, 80);
  });

  it('should exclude non-diesel expense types from diesel_used', async () => {
    const token = createOwnerToken();
    const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // The toll expense (350, no liters) should NOT be included
    // If it were erroneously added, diesel_used would be different
    assert.equal(data.yearly.diesel_used, 80);
  });

  it('should include diesel expenses from all trip statuses (not just completed)', async () => {
    const token = createOwnerToken();
    const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Trip 6 is 'ongoing' with 15L diesel — it is included
    // If only completed trips were counted, diesel_used would be 65 (45 + 20 only)
    assert.equal(data.yearly.diesel_used, 80);
  });

  // ── Role-based filtering ──

  it('should filter balance_to_collect by driver role', async () => {
    const token = createDriverToken();
    const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Driver user ID = 2; all trips have driver_id = 2 so all eligible trips should be included
    assert.ok(typeof data.total.balance_to_collect === 'number');
    assert.equal(data.total.balance_to_collect, 55000);
  });

  it('should return 401 without a token', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/stats`);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Authentication required');
  });
});
