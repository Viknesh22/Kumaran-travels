const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const initSqlJs = require('sql.js');

const tripRouter = require('../routes/trips');
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

// ── Add transaction support (sql.js alternative to @libsql/client's db.transaction) ──

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
  // @libsql/client's db.transaction wraps operations within a transaction.
  // sql.js doesn't have this, so we emulate it with BEGIN/COMMIT/ROLLBACK.
  transaction(fn) {
    const self = this;
    return async (...args) => {
      self._db.exec('BEGIN');
      try {
        const result = await fn(...args);
        self._db.exec('COMMIT');
        return result;
      } catch (e) {
        self._db.exec('ROLLBACK');
        throw e;
      }
    };
  }
}

// ── Helper: create an in-memory database with test data ──
async function createTestDatabase() {
  const SQL = await initSqlJs();
  const rawDb = new SQL.Database();
  const db = new Database(rawDb);

  // Create tables (same DDL as server/db.js initTables)
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
      diesel_rate_used REAL DEFAULT 90,
      estimated_diesel_cost REAL DEFAULT 0,
      driver_starting_cash REAL DEFAULT 0,
      driver_cash_collected REAL DEFAULT 0,
      driver_total_spent REAL DEFAULT 0,
      pending_amount REAL DEFAULT 0,
      pending_amount_collected REAL DEFAULT 0,
      pending_collected_by INTEGER,
      pending_collected_at DATETIME,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (driver_id) REFERENCES users(id),
      FOREIGN KEY (partner_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS trip_stops (
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
    );

    CREATE TABLE IF NOT EXISTS trip_expenses (
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

    CREATE TABLE IF NOT EXISTS diesel_refills (
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
    );

    CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
  `);

  // ── Seed users ──
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)'
  );
  await insertUser.run('Owner', 'owner@test.com', 'hash', '1234567890', 'owner');
  await insertUser.run('Driver One', 'driver1@test.com', 'hash', '1234567891', 'driver');
  await insertUser.run('Driver Two', 'driver2@test.com', 'hash', '1234567892', 'driver');
  await insertUser.run('Partner', 'partner@test.com', 'hash', '1234567893', 'partner');

  // ── Seed vehicles ──
  const insertVehicle = db.prepare(
    'INSERT INTO vehicles (registration_number, vehicle_name, owner_id) VALUES (?, ?, ?)'
  );
  await insertVehicle.run('TN45AX0001', 'Force Traveller', 1);
  await insertVehicle.run('TN45BX0002', 'Tempo Traveller', 1);

  // ── Seed an existing trip to test conflicts ──
  const insertTrip = db.prepare(`
    INSERT INTO trips (title, vehicle_id, driver_id, start_date, end_date, status, total_rent, advance_amount, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Trip 1: planned, vehicle 1, driver 1, 2026-06-10 to 2026-06-15
  await insertTrip.run('Existing Trip', 1, 2, '2026-06-10', '2026-06-15', 'planned', 30000, 10000, 1);
  // Trip 2: completed, vehicle 1, no conflict because it's completed
  await insertTrip.run('Past Trip', 1, null, '2026-05-01', '2026-05-05', 'completed', 20000, 20000, 1);
  // Trip 3: ongoing, vehicle 2, driver 2, 2026-06-20 to 2026-06-25
  await insertTrip.run('Ongoing', 2, 3, '2026-06-20', '2026-06-25', 'ongoing', 25000, 5000, 1);

  return db;
}

// ── JWT helpers ──
function createToken(userId, email, role, name) {
  return jwt.sign(
    { id: userId, email, role, name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const ownerToken = createToken(1, 'owner@test.com', 'owner', 'Owner');
const driverToken = createToken(2, 'driver1@test.com', 'driver', 'Driver One');
const partnerToken = createToken(4, 'partner@test.com', 'partner', 'Partner');

// ── Tests ──
describe('Trips API — CRUD & Conflict Detection', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    const testDb = await createTestDatabase();

    app = express();
    app.use(express.json());

    // Inject the test database
    app.use((req, res, next) => {
      req.db = testDb;
      next();
    });

    app.use('/api/trips', tripRouter);

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

  // ── Create Trip tests ──

  it('should create a trip with required fields', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Test Trip',
        vehicle_id: 1,
        start_date: '2026-07-01',
        end_date: '2026-07-05',
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    assert.equal(data.title, 'Test Trip');
    assert.equal(data.vehicle_id, 1);
    assert.equal(data.status, 'planned');
  });

  it('should create a trip with all optional fields', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Full Trip',
        vehicle_id: 2,
        driver_id: 3,
        start_date: '2026-08-01',
        end_date: '2026-08-05',
        total_rent: 50000,
        advance_amount: 20000,
        start_location: 'Trichy',
        end_location: 'Chennai',
        notes: 'Important trip',
        total_distance_km: 350,
        diesel_required_est: 50,
        diesel_rate_used: 92,
        driver_starting_cash: 5000,
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    assert.equal(data.title, 'Full Trip');
    assert.equal(data.total_rent, 50000);
    assert.equal(data.advance_amount, 20000);
    assert.equal(data.balance_amount, 30000); // 50000 - 20000
    assert.equal(data.start_location, 'Trichy');
    assert.equal(data.end_location, 'Chennai');
    assert.equal(data.notes, 'Important trip');
    assert.equal(data.diesel_rate_used, 92);
  });

  it('should create a payment record when advance_amount > 0', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Trip With Advance',
        vehicle_id: 2,
        start_date: '2026-09-01',
        end_date: '2026-09-03',
        total_rent: 25000,
        advance_amount: 10000,
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);

    // Verify payment was created
    const tripRes = await fetch(`${baseUrl}/api/trips/${data.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const tripDetail = await tripRes.json();
    assert.ok(Array.isArray(tripDetail.payments));
    assert.equal(tripDetail.payments.length, 1);
    assert.equal(tripDetail.payments[0].amount, 10000);
    assert.equal(tripDetail.payments[0].payment_type, 'advance');
  });

  it('should create a trip with stops', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Trip With Stops',
        vehicle_id: 1,
        start_date: '2026-10-01',
        end_date: '2026-10-03',
        stops: [
          { place_name: 'Trichy', stop_order: 0, stop_type: 'start' },
          { place_name: 'Madurai', stop_order: 1, stop_type: 'stop' },
          { place_name: 'Kanyakumari', stop_order: 2, stop_type: 'end' },
        ],
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);

    // Verify stops
    const detailRes = await fetch(`${baseUrl}/api/trips/${data.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const detail = await detailRes.json();
    assert.equal(detail.stops.length, 3);
    assert.equal(detail.stops[0].place_name, 'Trichy');
    assert.equal(detail.stops[0].stop_type, 'start');
    assert.equal(detail.stops[1].place_name, 'Madurai');
  });

  // ── Validation tests ──

  it('should reject a trip without title', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        vehicle_id: 1,
        start_date: '2026-07-01',
        end_date: '2026-07-05',
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  it('should reject a trip without vehicle_id', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'No Vehicle',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  it('should reject a trip without start_date', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'No Start Date',
        vehicle_id: 1,
        end_date: '2026-07-05',
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  // ── Vehicle Conflict Detection tests ──

  it('should detect vehicle conflict for overlapping dates (same vehicle, planned)', async () => {
    // Vehicle 1 is booked 2026-06-10 to 2026-06-15 (planned)
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Conflict Trip',
        vehicle_id: 1,
        start_date: '2026-06-12',
        end_date: '2026-06-14',
      }),
    });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('Vehicle is already booked'));
    assert.ok(Array.isArray(data.conflicts));
    assert.equal(data.conflicts.length, 1);
    assert.equal(data.conflicts[0].id, 1); // Existing trip ID
  });

  it('should allow booking when vehicle conflict is with a completed trip', async () => {
    // Vehicle 1: trip 2 is completed 2026-05-01 to 2026-05-05 → should NOT conflict
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'OK After Completed',
        vehicle_id: 1,
        start_date: '2026-05-02',
        end_date: '2026-05-04',
      }),
    });
    assert.equal(res.status, 201);
  });

  it('should detect vehicle conflict when dates surround existing booking', async () => {
    // Vehicle 1 is booked 2026-06-10 to 2026-06-15
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Surrounding Conflict',
        vehicle_id: 1,
        start_date: '2026-06-08',
        end_date: '2026-06-18',
      }),
    });
    assert.equal(res.status, 409);
  });

  it('should not conflict for non-overlapping dates on same vehicle', async () => {
    // Vehicle 1 booked 2026-06-10 to 2026-06-15 → try June 16-20 (OK, no overlap)
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'No Overlap',
        vehicle_id: 1,
        start_date: '2026-06-16',
        end_date: '2026-06-20',
      }),
    });
    assert.equal(res.status, 201);
  });

  // ── Driver Conflict Detection tests ──

  it('should detect driver conflict for overlapping dates', async () => {
    // Driver 2 is assigned to ongoing trip on vehicle 2, 2026-06-20 to 2026-06-25
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Driver Conflict',
        vehicle_id: 1, // Different vehicle
        driver_id: 3,  // Driver Two (driver2@test.com) = ID 3, who is on vehicle 2 ongoing trip
        start_date: '2026-06-22',
        end_date: '2026-06-26',
      }),
    });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('Driver is already assigned'));
  });

  it('should allow trip when driver is available', async () => {
    // Driver 2 (ID 2) is only on the existing planned trip (2026-06-10 to 2026-06-15), try different dates
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Driver Available',
        vehicle_id: 2,
        driver_id: 2, // Driver One
        start_date: '2026-07-01',
        end_date: '2026-07-05',
      }),
    });
    assert.equal(res.status, 201);
  });

  it('should allow trip without a driver even if that driver is busy', async () => {
    // No driver_id provided, so no driver conflict check runs
    // Use vehicle 1 (free during June 22-26 — its only trip is June 10-15)
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'No Driver Specified',
        vehicle_id: 1,
        start_date: '2026-06-22',
        end_date: '2026-06-26', // No conflict: vehicle 1's trip is June 10-15
        // No driver_id
      }),
    });
    assert.equal(res.status, 201);
  });

  // ── Auth tests (no token) ──

  it('should return 401 without a token', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'No Auth',
        vehicle_id: 1,
        start_date: '2026-07-01',
        end_date: '2026-07-05',
      }),
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Authentication required');
  });

  // ── GET /:id — Trip Detail tests ──

  it('should get trip detail with all related data', async () => {
    // First create a trip with stops
    const createRes = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Detail Test',
        vehicle_id: 2,
        start_date: '2026-11-01',
        end_date: '2026-11-03',
        stops: [
          { place_name: 'A', stop_order: 0, stop_type: 'start' },
          { place_name: 'B', stop_order: 1, stop_type: 'end' },
        ],
      }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/trips/${created.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, created.id);
    assert.equal(data.title, 'Detail Test');
    assert.equal(data.vehicle_name, 'Tempo Traveller');
    assert.equal(data.registration_number, 'TN45BX0002');
    assert.ok(Array.isArray(data.stops));
    assert.equal(data.stops.length, 2);
    assert.ok(Array.isArray(data.expenses));
    assert.ok(Array.isArray(data.payments));
    assert.ok(Array.isArray(data.dieselRefills));
  });

  it('should return 404 for non-existent trip', async () => {
    const res = await fetch(`${baseUrl}/api/trips/99999`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 404);
  });

  // ── GET / — List tests ──

  it('should list all trips', async () => {
    const res = await fetch(`${baseUrl}/api/trips`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 3); // At least the 3 seeded trips
    // Should include vehicle and driver info
    if (data.length > 0) {
      assert.ok(data[0].vehicle_name !== undefined);
    }
  });

  it('should filter trips by status', async () => {
    const res = await fetch(`${baseUrl}/api/trips?status=planned`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    data.forEach(t => assert.equal(t.status, 'planned'));
  });

  it('should filter trips by date range', async () => {
    const res = await fetch(`${baseUrl}/api/trips?start_date=2026-06-01&end_date=2026-06-30`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.length > 0);
  });

  // ── PUT /:id — Update tests ──

  it('should update a trip title', async () => {
    // Create a trip first
    const createRes = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'To Update',
        vehicle_id: 1,
        start_date: '2026-12-01',
        end_date: '2026-12-03',
      }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/trips/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.title, 'Updated Title');
  });

  it('should detect vehicle conflict on update', async () => {
    // Vehicle 1 is already booked 2026-06-10 to 2026-06-15 (trip 1)
    // Create another trip on vehicle 2, then try to move it to vehicle 1 with overlapping dates
    const createRes = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Move To Conflict',
        vehicle_id: 2,
        start_date: '2026-12-10',
        end_date: '2026-12-15',
      }),
    });
    const created = await createRes.json();

    // Now try to move it to vehicle 1 on conflicting dates
    const res = await fetch(`${baseUrl}/api/trips/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        vehicle_id: 1,
        start_date: '2026-06-12', // Overlaps with trip 1 (2026-06-10 to 2026-06-15)
        end_date: '2026-06-14',
      }),
    });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('already booked'));
  });

  // ── DELETE /:id tests ──

  it('should delete a trip', async () => {
    const createRes = await fetch(`${baseUrl}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'To Delete',
        vehicle_id: 1,
        start_date: '2026-12-20',
        end_date: '2026-12-22',
      }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/trips/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);

    // Verify it's gone
    const getRes = await fetch(`${baseUrl}/api/trips/${created.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(getRes.status, 404);
  });

  it('should return 404 when deleting non-existent trip', async () => {
    const res = await fetch(`${baseUrl}/api/trips/99999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 404);
  });

  // ── Availability endpoint tests ──

  it('should return availability for a free vehicle', async () => {
    // Vehicle 2 has a trip on July 1-5 from the 'driver available' test above.
    // Use vehicle 1 with dates Aug 1-5 which are free.
    const res = await fetch(`${baseUrl}/api/trips/availability?vehicle_id=1&start_date=2026-08-01&end_date=2026-08-05`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.available, true);
    assert.equal(data.conflicts.length, 0);
  });

  it('should return conflicts for a booked vehicle', async () => {
    const res = await fetch(`${baseUrl}/api/trips/availability?vehicle_id=1&start_date=2026-06-12&end_date=2026-06-14`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.available, false);
    assert.ok(data.conflicts.length > 0);
  });
});
