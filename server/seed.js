const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

async function seed() {
  try {
    const db = await getDb();
    
    console.log('Seeding database...\n');

    // Clear existing data
    const deletes = [
      'DELETE FROM diesel_refills',
      'DELETE FROM trip_expenses',
      'DELETE FROM payments',
      'DELETE FROM trip_stops',
      'DELETE FROM trips',
      'DELETE FROM maintenance_logs',
      'DELETE FROM vehicles',
      'DELETE FROM users',
    ];
    for (const sql of deletes) {
      await db.exec(sql);
    }

    console.log('Cleared existing data.');

    // Create users
    const password = bcrypt.hashSync('password123', 10);

    const users = [
      { name: 'Kumaran (Owner)', email: 'owner@kumaran.com', password, phone: '9876543210', role: 'owner' },
      { name: 'Rajesh (Partner)', email: 'partner@kumaran.com', password, phone: '9876543211', role: 'partner' },
      { name: 'Suresh (Driver)', email: 'driver@kumaran.com', password, phone: '9876543212', role: 'driver' },
      { name: 'Mani (Driver)', email: 'mani@kumaran.com', password, phone: '9876543213', role: 'driver' },
    ];

    const insertUser = db.prepare('INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)');
    const userIds = [];
    for (const u of users) {
      const result = await insertUser.run(u.name, u.email, u.password, u.phone, u.role);
      userIds.push(result.lastInsertRowid);
    }

    console.log(`Created ${users.length} users.`);
    console.log('  Owner ID:', userIds[0]);
    console.log('  Partner ID:', userIds[1]);
    console.log('  Driver IDs:', userIds[2], userIds[3]);

    // Create vehicles
    const vehicles = [
      { registration_number: 'TN45AX1234', vehicle_name: 'Kumaran Travels - Force Traveller', owner_id: userIds[0], capacity: 12, mileage_kmpl: 7 },
      { registration_number: 'TN45BX5678', vehicle_name: 'Kumaran Travels - Tempo Traveller', owner_id: userIds[0], capacity: 12, mileage_kmpl: 8 },
    ];

    const insertVehicle = db.prepare('INSERT INTO vehicles (registration_number, vehicle_name, owner_id, capacity, mileage_kmpl) VALUES (?, ?, ?, ?, ?)');
    const vehicleIds = [];
    for (const v of vehicles) {
      const result = await insertVehicle.run(v.registration_number, v.vehicle_name, v.owner_id, v.capacity, v.mileage_kmpl);
      vehicleIds.push(result.lastInsertRowid);
    }

    console.log(`Created ${vehicles.length} vehicles.`);

    // Helper to ensure no undefined values in SQL bind
    const n = (v, fallback = null) => (v === undefined ? fallback : v);

    // Create sample trips
    const trips = [
      {
        title: 'Trichy to Kanyakumari Pilgrimage',
        vehicle_id: vehicleIds[0],
        driver_id: userIds[2],
        partner_id: userIds[1],
        start_date: '2026-04-15',
        end_date: '2026-04-20',
        total_rent: 35000,
        advance_amount: 15000,
        start_location: 'Trichy',
        end_location: 'Srirangam',
        status: 'planned',
        created_by: userIds[0],
      },
      {
        title: 'Madurai Temple Trip',
        vehicle_id: vehicleIds[0],
        driver_id: userIds[3],
        partner_id: userIds[1],
        start_date: '2026-05-01',
        end_date: '2026-05-02',
        total_rent: 12000,
        advance_amount: 5000,
        start_location: 'Trichy',
        end_location: 'Trichy',
        status: 'completed',
        created_by: userIds[0],
      },
      {
        title: 'Rameswaram Tour',
        vehicle_id: vehicleIds[1],
        driver_id: userIds[2],
        start_date: '2026-03-20',
        end_date: '2026-03-22',
        total_rent: 25000,
        advance_amount: 25000,
        start_km_reading: 45200,
        end_km_reading: 45850,
        total_distance_km: 650,
        diesel_used_liters: 45,
        mileage: 14.44,
        start_location: 'Trichy',
        end_location: 'Trichy',
        status: 'completed',
        created_by: userIds[0],
      },
    ];

    const insertTrip = db.prepare(`
      INSERT INTO trips (title, vehicle_id, driver_id, partner_id, start_date, end_date,
        total_rent, advance_amount, balance_amount, start_km_reading, end_km_reading,
        total_distance_km, diesel_used_liters, mileage, start_location, end_location, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tripIds = [];
    for (const t of trips) {
      const balance = t.total_rent - t.advance_amount;
      const result = await insertTrip.run(
        t.title, t.vehicle_id, n(t.driver_id), n(t.partner_id),
        t.start_date, t.end_date, t.total_rent, t.advance_amount, balance,
        n(t.start_km_reading), n(t.end_km_reading),
        n(t.total_distance_km, 0), n(t.diesel_used_liters), n(t.mileage),
        n(t.start_location), n(t.end_location),
        t.status, t.created_by
      );
      tripIds.push(result.lastInsertRowid);
    }

    console.log(`Created ${trips.length} sample trips.`);

    // Stops for first trip (Trichy to Kanyakumari Pilgrimage)
    const stopsData = [
      { trip_id: tripIds[0], place_name: 'Trichy (Start)', latitude: 10.7905, longitude: 78.7047, stop_order: 0, stop_type: 'start', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Madurai - Meenakshi Temple', latitude: 9.9195, longitude: 78.1193, stop_order: 1, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Thirupparankundram Temple', latitude: 9.8829, longitude: 78.0709, stop_order: 2, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Azhagar Temple', latitude: 10.0709, longitude: 78.2083, stop_order: 3, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Devipattinam', latitude: 9.4800, longitude: 78.9000, stop_order: 4, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Rameswaram', latitude: 9.2876, longitude: 79.3129, stop_order: 5, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Thiruchendur', latitude: 8.4956, longitude: 78.1207, stop_order: 6, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Thoothukudi', latitude: 8.7642, longitude: 78.1348, stop_order: 7, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Kanyakumari Beach', latitude: 8.0883, longitude: 77.5385, stop_order: 8, stop_type: 'stop', is_return_trip: 0 },
      { trip_id: tripIds[0], place_name: 'Nava Tirupathi Temples (Return)', latitude: 8.7000, longitude: 77.7000, stop_order: 9, stop_type: 'stop', is_return_trip: 1 },
      { trip_id: tripIds[0], place_name: 'Srirangam (Drop)', latitude: 10.8625, longitude: 78.6880, stop_order: 10, stop_type: 'end', is_return_trip: 0 },
    ];

    const insertStop = db.prepare('INSERT INTO trip_stops (trip_id, place_name, latitude, longitude, stop_order, stop_type, is_return_trip) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const s of stopsData) {
      await insertStop.run(s.trip_id, s.place_name, n(s.latitude), n(s.longitude), s.stop_order, s.stop_type, s.is_return_trip);
    }

    // Expenses for completed trip
    const expensesData = [
      { trip_id: tripIds[2], expense_type: 'diesel', amount: 5850, liters: 45, description: 'Diesel refill at Rameswaram', paid_by: userIds[2] },
      { trip_id: tripIds[2], expense_type: 'toll', amount: 350, description: 'Toll charges - Trichy to Madurai', paid_by: userIds[2] },
      { trip_id: tripIds[2], expense_type: 'toll', amount: 280, description: 'Toll charges - Madurai to Rameswaram', paid_by: userIds[2] },
      { trip_id: tripIds[2], expense_type: 'parking', amount: 150, description: 'Parking at Rameswaram Temple', paid_by: userIds[2] },
      { trip_id: tripIds[2], expense_type: 'food', amount: 600, description: 'Driver food allowance', paid_by: userIds[2] },
    ];

    const insertExpense = db.prepare('INSERT INTO trip_expenses (trip_id, expense_type, amount, liters, description, paid_by) VALUES (?, ?, ?, ?, ?, ?)');
    for (const e of expensesData) {
      await insertExpense.run(e.trip_id, e.expense_type, e.amount, n(e.liters), e.description, e.paid_by);
    }

    // Payments for completed trip
    const paymentsData = [
      { trip_id: tripIds[2], payer_type: 'customer', amount: 15000, payment_type: 'advance', description: 'Advance booking payment', received_by: userIds[0] },
      { trip_id: tripIds[2], payer_type: 'customer', amount: 10000, payment_type: 'balance', description: 'Balance payment before trip', received_by: userIds[0] },
      { trip_id: tripIds[2], payer_type: 'driver', amount: 5850, payment_type: 'diesel_refill', description: 'Driver paid for diesel - to be reimbursed', received_by: userIds[0] },
    ];

    const insertPayment = db.prepare('INSERT INTO payments (trip_id, payer_type, amount, payment_type, description, received_by) VALUES (?, ?, ?, ?, ?, ?)');
    for (const p of paymentsData) {
      await insertPayment.run(p.trip_id, p.payer_type, p.amount, p.payment_type, n(p.description), p.received_by);
    }

    // Diesel refills for completed trip
    const refillsData = [
      { trip_id: tripIds[2], liters: 45, amount: 5850, filled_by: userIds[2] },
    ];

    const insertRefill = db.prepare('INSERT INTO diesel_refills (trip_id, liters, amount, filled_by) VALUES (?, ?, ?, ?)');
    for (const r of refillsData) {
      await insertRefill.run(r.trip_id, r.liters, r.amount, r.filled_by);
    }

    console.log('Created stops, expenses, payments, and diesel refills.');
    console.log('\n✅ Seed data created successfully!');
    console.log('');
    console.log('Login Credentials:');
    console.log('  Owner:   owner@kumaran.com / password123');
    console.log('  Partner: partner@kumaran.com / password123');
    console.log('  Driver:  driver@kumaran.com / password123');
    console.log('  Driver:  mani@kumaran.com / password123');
    console.log('');
    console.log('Start the server:');
    console.log('  cd server && node index.js');
    
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message, err.stack);
    process.exit(1);
  }
}

seed();
