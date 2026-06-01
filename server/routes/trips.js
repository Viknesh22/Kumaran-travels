const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { sendTripConfirmation } = require('../services/notificationService');

// Get all trips with filters
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { status, start_date, end_date, vehicle_id, driver_id, partner_id, month, year } = req.query;

    let query = `
      SELECT t.*, 
        v.registration_number, v.vehicle_name,
        d.name as driver_name,
        p.name as partner_name,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM trip_stops WHERE trip_id = t.id) as stops_count,
        (SELECT COALESCE(SUM(amount), 0) FROM trip_expenses WHERE trip_id = t.id) as total_expenses,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE trip_id = t.id) as total_collected
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN users d ON t.driver_id = d.id
      LEFT JOIN users p ON t.partner_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND t.status = ?'; params.push(status); }
    if (vehicle_id) { query += ' AND t.vehicle_id = ?'; params.push(vehicle_id); }
    if (driver_id) { query += ' AND t.driver_id = ?'; params.push(driver_id); }
    if (partner_id) { query += ' AND t.partner_id = ?'; params.push(partner_id); }
    if (start_date) { query += ' AND t.start_date >= ?'; params.push(start_date); }
    if (end_date) { query += ' AND t.end_date <= ?'; params.push(end_date); }
    if (month) { query += " AND substr(t.start_date, 6, 2) = ?"; params.push(month.padStart(2, '0')); }
    if (year) { query += " AND substr(t.start_date, 1, 4) = ?"; params.push(year); }

    // Role-based filtering
    if (req.user.role === 'driver') {
      query += ' AND t.driver_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'partner') {
      query += ' AND t.partner_id = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY t.created_at DESC';

    const trips = await db.prepare(query).all(...params);
    res.json(trips);
  } catch (err) {
    console.error('Trips list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check vehicle and driver availability
router.get('/availability', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { vehicle_id, driver_id, start_date, end_date, exclude_trip_id } = req.query;

    if (!vehicle_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'Vehicle ID, start date, and end date are required' });
    }

    // Check vehicle conflicts
    let vehicleQuery = `
      SELECT t.id, t.title, t.start_date, t.end_date, t.status,
        d.name as driver_name, 'vehicle' as conflict_type
      FROM trips t
      LEFT JOIN users d ON t.driver_id = d.id
      WHERE t.vehicle_id = ?
      AND t.status IN ('planned', 'ongoing')
      AND (
        (t.start_date <= ? AND t.end_date >= ?)
      )
    `;
    const vehicleParams = [vehicle_id, end_date, start_date];

    if (exclude_trip_id) {
      vehicleQuery += ' AND t.id != ?';
      vehicleParams.push(exclude_trip_id);
    }

    const vehicleConflicts = await db.prepare(vehicleQuery).all(...vehicleParams);

    // Check driver conflicts if driver_id is provided
    let driverConflicts = [];
    if (driver_id) {
      let driverQuery = `
        SELECT t.id, t.title, t.start_date, t.end_date, t.status,
          v.vehicle_name, 'driver' as conflict_type
        FROM trips t
        JOIN vehicles v ON t.vehicle_id = v.id
        WHERE t.driver_id = ?
        AND t.status IN ('planned', 'ongoing')
        AND (
          (t.start_date <= ? AND t.end_date >= ?)
        )
      `;
      const driverParams = [driver_id, end_date, start_date];

      if (exclude_trip_id) {
        driverQuery += ' AND t.id != ?';
        driverParams.push(exclude_trip_id);
      }

      driverConflicts = await db.prepare(driverQuery).all(...driverParams);
    }

    const allConflicts = [...vehicleConflicts, ...driverConflicts];
    res.json({ available: allConflicts.length === 0, conflicts: allConflicts });
  } catch (err) {
    console.error('Availability check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all booked date ranges for a specific vehicle (for blocking dates in TripForm)
router.get('/booked-dates', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { vehicle_id, driver_id } = req.query;

    if (!vehicle_id && !driver_id) {
      return res.status(400).json({ error: 'Vehicle ID or Driver ID is required' });
    }

    let conditions = [];
    const params = [];

    if (vehicle_id) {
      conditions.push('t.vehicle_id = ?');
      params.push(vehicle_id);
    }
    if (driver_id) {
      conditions.push('t.driver_id = ?');
      params.push(driver_id);
    }

    const query = `
      SELECT t.id, t.title, t.start_date, t.end_date, t.status,
        v.vehicle_name, v.registration_number,
        d.name as driver_name
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN users d ON t.driver_id = d.id
      WHERE (${conditions.join(' OR ')})
      AND t.status IN ('planned', 'ongoing')
      ORDER BY t.start_date ASC
    `;

    const bookedRanges = await db.prepare(query).all(...params);
    res.json(bookedRanges);
  } catch (err) {
    console.error('Booked dates error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get upcoming pre-booked dates for calendar
router.get('/calendar', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { year, month } = req.query;

    let query = `
      SELECT t.id, t.title, t.start_date, t.end_date, t.status,
        t.driver_id,
        v.id as vehicle_id, v.vehicle_name, v.registration_number,
        d.name as driver_name
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN users d ON t.driver_id = d.id
      WHERE t.status IN ('planned', 'ongoing')
    `;
    const params = [];

    if (year && month) {
      query += " AND (substr(t.start_date, 1, 4) = ? AND substr(t.start_date, 6, 2) = ?)";
      params.push(year, month.padStart(2, '0'));
    }

    query += ' ORDER BY t.start_date';

    const bookings = await db.prepare(query).all(...params);
    res.json(bookings);
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single trip with all details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const trip = await db.prepare(`
      SELECT t.*, 
        v.registration_number, v.vehicle_name, v.capacity,
        d.name as driver_name, d.phone as driver_phone,
        p.name as partner_name, p.phone as partner_phone,
        u.name as created_by_name
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN users d ON t.driver_id = d.id
      LEFT JOIN users p ON t.partner_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const stops = await db.prepare('SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY stop_order').all(req.params.id);
    const expenses = await db.prepare(`
      SELECT e.*, u.name as paid_by_name
      FROM trip_expenses e
      LEFT JOIN users u ON e.paid_by = u.id
      WHERE e.trip_id = ?
      ORDER BY e.created_at
    `).all(req.params.id);
    const payments = await db.prepare(`
      SELECT p.*, u.name as received_by_name
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.trip_id = ?
      ORDER BY p.created_at
    `).all(req.params.id);
    const dieselRefills = await db.prepare(`
      SELECT dr.*, u.name as filled_by_name
      FROM diesel_refills dr
      LEFT JOIN users u ON dr.filled_by = u.id
      WHERE dr.trip_id = ?
      ORDER BY dr.created_at
    `).all(req.params.id);

    res.json({ ...trip, stops, expenses, payments, dieselRefills });
  } catch (err) {
    console.error('Trip detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create trip
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const {
      title, vehicle_id, driver_id, partner_id, start_date, end_date,
      total_rent, advance_amount, start_location, end_location, notes,
      total_distance_km, diesel_required_est, diesel_rate_used, mileage,
      driver_starting_cash,
      stops
    } = req.body;

    if (!title || !vehicle_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'Title, vehicle, start date, and end date are required' });
    }

    // Check vehicle availability
    const vehicleConflicts = await db.prepare(`
      SELECT id FROM trips WHERE vehicle_id = ? AND status IN ('planned', 'ongoing')
      AND (
        (start_date <= ? AND end_date >= ?)
      )
    `).all(vehicle_id, end_date, start_date);

    if (vehicleConflicts.length > 0) {
      return res.status(409).json({ 
        error: 'Vehicle is already booked for these dates',
        conflicts: vehicleConflicts
      });
    }

    // Check driver availability
    if (driver_id) {
      const driverConflicts = await db.prepare(`
        SELECT id FROM trips WHERE driver_id = ? AND status IN ('planned', 'ongoing')
        AND (
          (start_date <= ? AND end_date >= ?)
        )
      `).all(driver_id, end_date, start_date);

      if (driverConflicts.length > 0) {
        return res.status(409).json({ 
          error: 'Driver is already assigned to another trip for these dates',
          conflicts: driverConflicts
        });
      }
    }

    const balance_amount = (total_rent || 0) - (advance_amount || 0);

    // Calculate estimated diesel cost using the rate from settings or submitted rate
    const effectiveDieselRate = diesel_rate_used || 90;
    const estimatedCost = (diesel_required_est || 0) * effectiveDieselRate;

    const result = await db.prepare(`
      INSERT INTO trips (title, vehicle_id, driver_id, partner_id, start_date, end_date,
        total_rent, advance_amount, balance_amount, start_location, end_location, notes,
        total_distance_km, diesel_required_est, diesel_rate_used, estimated_diesel_cost, mileage,
        driver_starting_cash, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, vehicle_id, driver_id || null, partner_id || null,
      start_date, end_date, total_rent || 0, advance_amount || 0,
      balance_amount, start_location || null, end_location || null,
      notes || null,
      total_distance_km || 0, diesel_required_est || 0,
      effectiveDieselRate, parseFloat(estimatedCost.toFixed(2)),
      mileage || 0,
      driver_starting_cash || 0,
      req.user.id
    );

    const tripId = result.lastInsertRowid;

    // Add stops if provided
    if (stops && Array.isArray(stops) && stops.length > 0) {
      const insertStop = db.prepare(`
        INSERT INTO trip_stops (trip_id, place_name, latitude, longitude, stop_order, stop_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertMany = db.transaction(async (stopsData) => {
        for (const stop of stopsData) {
          await insertStop.run(tripId, stop.place_name, stop.latitude || null, stop.longitude || null, stop.stop_order, stop.stop_type || 'stop');
        }
      });
      await insertMany(stops);
    }

    // If advance amount, record payment
    if (advance_amount > 0) {
      await db.prepare(`
        INSERT INTO payments (trip_id, payer_type, amount, payment_type, description, received_by)
        VALUES (?, 'customer', ?, 'advance', 'Advance payment for booking', ?)
      `).run(tripId, advance_amount, req.user.id);
    }

    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);

    // Send notification emails to driver & partner (non-blocking — don't await)
    (async () => {
      try {
        const driver = driver_id ? await db.prepare('SELECT name, email FROM users WHERE id = ?').get(driver_id) : null;
        const partner = partner_id ? await db.prepare('SELECT name, email FROM users WHERE id = ?').get(partner_id) : null;
        const vehicle = await db.prepare('SELECT vehicle_name FROM vehicles WHERE id = ?').get(vehicle_id);
        
        if (driver || partner) {
          await sendTripConfirmation({
            db,
            trip,
            driver,
            partner,
            vehicleName: vehicle?.vehicle_name,
          });
        }
      } catch (notifErr) {
        console.error('Failed to send trip notification (non-blocking):', notifErr.message);
      }
    })();

    res.status(201).json(trip);
  } catch (err) {
    console.error('Create trip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update trip
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const {
      title, vehicle_id, driver_id, partner_id, start_date, end_date,
      total_rent, advance_amount, start_location, end_location, notes, status,
      start_km_reading, end_km_reading, total_distance_km, diesel_required_est, diesel_used_liters,
      diesel_rate_used, driver_starting_cash, driver_cash_collected, driver_total_spent,
      pending_amount, pending_amount_collected
    } = req.body;

    // Check availability if dates or vehicle or driver changed
    const datesOrVehicleChanged = (vehicle_id && vehicle_id !== trip.vehicle_id) || 
        (start_date && start_date !== trip.start_date) || 
        (end_date && end_date !== trip.end_date);
    const driverChanged = driver_id !== undefined && driver_id !== trip.driver_id;

    if (datesOrVehicleChanged) {
      const conflicts = await db.prepare(`
        SELECT id FROM trips WHERE vehicle_id = ? AND status IN ('planned', 'ongoing')
        AND id != ?
        AND (
          (start_date <= ? AND end_date >= ?)
        )
      `).all(
        vehicle_id || trip.vehicle_id,
        trip.id,
        end_date || trip.end_date,
        start_date || trip.start_date
      );

      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'Vehicle is already booked for these dates', conflicts });
      }
    }

    // Check driver availability if driver changed
    if (driverChanged) {
      const effectiveDriverId = driver_id !== undefined ? driver_id : trip.driver_id;
      if (effectiveDriverId) {
        const driverConflicts = await db.prepare(`
          SELECT id FROM trips WHERE driver_id = ? AND status IN ('planned', 'ongoing')
          AND id != ?
          AND (
            (start_date <= ? AND end_date >= ?)
          )
        `).all(
          effectiveDriverId,
          trip.id,
          end_date || trip.end_date,
          start_date || trip.start_date
        );

        if (driverConflicts.length > 0) {
          return res.status(409).json({ error: 'Driver is already assigned to another trip for these dates', conflicts: driverConflicts });
        }
      }
    }

    const newTotalRent = total_rent !== undefined ? total_rent : trip.total_rent;
    const newAdvance = advance_amount !== undefined ? advance_amount : trip.advance_amount;
    const newBalance = newTotalRent - newAdvance;

    // Calculate mileage if end km and diesel provided
    let mileage = trip.mileage;
    if (end_km_reading && start_km_reading && (diesel_used_liters || trip.diesel_used_liters)) {
      const distance = parseInt(end_km_reading) - parseInt(start_km_reading);
      const diesel = diesel_used_liters || trip.diesel_used_liters;
      if (distance > 0 && diesel > 0) {
        mileage = parseFloat((distance / diesel).toFixed(2));
      }
    }

    // Calculate pending amount if completing trip or updating
    let newPendingAmount = trip.pending_amount || 0;
    if (pending_amount !== undefined) {
      newPendingAmount = pending_amount;
    } else if (status === 'completed' && trip.status !== 'completed') {
      // When completing a trip, set pending = balance if not yet collected
      const collectedSoFar = (advance_amount !== undefined ? advance_amount : trip.advance_amount);
      const totalRentVal = (total_rent !== undefined ? total_rent : trip.total_rent);
      newPendingAmount = Math.max(0, totalRentVal - collectedSoFar);
    }

    // Determine diesel rate — use submitted rate, or keep existing
    const effectiveDieselRate = diesel_rate_used !== undefined ? diesel_rate_used : (trip.diesel_rate_used || 90);
    const currentDieselEst = diesel_required_est !== undefined ? diesel_required_est : trip.diesel_required_est;
    const estimatedCost = (currentDieselEst || 0) * effectiveDieselRate;

    await db.prepare(`
      UPDATE trips SET
        title = ?, vehicle_id = ?, driver_id = ?, partner_id = ?,
        start_date = ?, end_date = ?, status = ?,
        total_rent = ?, advance_amount = ?, balance_amount = ?,
        start_location = ?, end_location = ?, notes = ?,
        total_distance_km = COALESCE(?, total_distance_km),
        diesel_required_est = COALESCE(?, diesel_required_est),
        diesel_rate_used = COALESCE(?, diesel_rate_used),
        estimated_diesel_cost = ?,
        start_km_reading = COALESCE(?, start_km_reading),
        end_km_reading = COALESCE(?, end_km_reading),
        diesel_used_liters = COALESCE(?, diesel_used_liters),
        mileage = ?,
        driver_starting_cash = COALESCE(?, driver_starting_cash),
        driver_cash_collected = COALESCE(?, driver_cash_collected),
        driver_total_spent = COALESCE(?, driver_total_spent),
        pending_amount = COALESCE(?, pending_amount),
        pending_amount_collected = COALESCE(?, pending_amount_collected),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title || trip.title,
      vehicle_id || trip.vehicle_id,
      driver_id !== undefined ? driver_id : trip.driver_id,
      partner_id !== undefined ? partner_id : trip.partner_id,
      start_date || trip.start_date,
      end_date || trip.end_date,
      status || trip.status,
      newTotalRent, newAdvance, newBalance,
      start_location !== undefined ? start_location : trip.start_location,
      end_location !== undefined ? end_location : trip.end_location,
      notes !== undefined ? notes : trip.notes,
      total_distance_km || null,
      currentDieselEst || null,
      effectiveDieselRate,
      parseFloat(estimatedCost.toFixed(2)),
      start_km_reading || null,
      end_km_reading || null,
      diesel_used_liters || null,
      mileage,
      driver_starting_cash !== undefined ? driver_starting_cash : null,
      driver_cash_collected !== undefined ? driver_cash_collected : null,
      driver_total_spent !== undefined ? driver_total_spent : null,
      newPendingAmount || null,
      pending_amount_collected !== undefined ? pending_amount_collected : null,
      req.params.id
    );

    // Record additional advance payment if increased
    if (advance_amount > trip.advance_amount) {
      const additional = advance_amount - trip.advance_amount;
      await db.prepare(`
        INSERT INTO payments (trip_id, payer_type, amount, payment_type, description, received_by)
        VALUES (?, 'customer', ?, 'balance', 'Additional payment', ?)
      `).run(req.params.id, additional, req.user.id);
    }

    const updated = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update trip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update trip stops
router.put('/:id/stops', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const { stops } = req.body;
    if (!stops || !Array.isArray(stops)) {
      return res.status(400).json({ error: 'Stops array is required' });
    }

    const deleteStops = db.prepare('DELETE FROM trip_stops WHERE trip_id = ?');
    const insertStop = db.prepare(`
      INSERT INTO trip_stops (trip_id, place_name, latitude, longitude, stop_order, stop_type, is_return_trip)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updateTransaction = db.transaction(async () => {
      await deleteStops.run(req.params.id);
      for (const stop of stops) {
        await insertStop.run(
          req.params.id, stop.place_name, stop.latitude || null, stop.longitude || null,
          stop.stop_order, stop.stop_type || 'stop', stop.is_return_trip || 0
        );
      }
    });
    await updateTransaction();

    const updatedStops = await db.prepare('SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY stop_order').all(req.params.id);

    // Calculate approximate distance from stops coordinates
    let totalDistance = 0;
    const orderedStops = updatedStops.filter(s => s.latitude && s.longitude);
    
    if (orderedStops.length >= 2) {
      for (let i = 1; i < orderedStops.length; i++) {
        const dist = haversineDistance(
          orderedStops[i - 1].latitude, orderedStops[i - 1].longitude,
          orderedStops[i].latitude, orderedStops[i].longitude
        );
        totalDistance += dist;
      }
      
      // Use vehicle's actual mileage for diesel estimate, fall back to 15 km/l
      const vehicle = await db.prepare('SELECT mileage_kmpl FROM vehicles WHERE id = ?').get(trip.vehicle_id);
      const defaultMileage = vehicle?.mileage_kmpl > 0 ? vehicle.mileage_kmpl : 15;
      const estimatedDiesel = totalDistance > 0 ? parseFloat((totalDistance / defaultMileage).toFixed(1)) : 0;
      
      // Load the diesel rate from settings (owner-modified), fall back to 90
      const rateSetting = await db.prepare("SELECT setting_value FROM notification_settings WHERE setting_key = 'DIESEL_RATE'").get();
      const dieselRate = rateSetting ? parseFloat(rateSetting.setting_value) : 90;
      const estimatedCost = (estimatedDiesel || 0) * dieselRate;
      
      await db.prepare('UPDATE trips SET total_distance_km = ?, diesel_required_est = ?, diesel_rate_used = ?, estimated_diesel_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(parseFloat(totalDistance.toFixed(1)), estimatedDiesel, dieselRate, parseFloat(estimatedCost.toFixed(2)), req.params.id);
    }

    res.json({ stops: updatedStops, estimatedDistance: parseFloat(totalDistance.toFixed(1)) });
  } catch (err) {
    console.error('Update stops error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get vehicle availability summary for a date range (used by TripForm dropdown)
router.get('/vehicle-availability', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { start_date, end_date, exclude_trip_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    let query = `
      SELECT DISTINCT t.vehicle_id
      FROM trips t
      WHERE t.status IN ('planned', 'ongoing')
      AND (
        (t.start_date <= ? AND t.end_date >= ?)
      )
    `;
    const params = [end_date, start_date];

    if (exclude_trip_id) {
      query += ' AND t.id != ?';
      params.push(exclude_trip_id);
    }

    const booked = await db.prepare(query).all(...params);
    const bookedVehicleIds = booked.map(b => b.vehicle_id);
    res.json({ booked_vehicle_ids: bookedVehicleIds });
  } catch (err) {
    console.error('Vehicle availability error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record diesel refill during trip
router.post('/:id/diesel-refill', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { liters, amount } = req.body;
    if (!liters || !amount) {
      return res.status(400).json({ error: 'Liters and amount are required' });
    }

    const ratePerLiter = parseFloat((parseFloat(amount) / parseFloat(liters)).toFixed(2));

    // Get user name for the record
    const user = await db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);

    await db.prepare(`
      INSERT INTO diesel_refills (trip_id, liters, amount, rate_per_liter, filled_by, filled_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.id, liters, amount, ratePerLiter, req.user.id, user?.name || 'Unknown');

    // Also add as a trip expense for proper financial tracking
    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
    await db.prepare(`
      INSERT INTO trip_expenses (trip_id, expense_type, amount, liters, description, paid_by)
      VALUES (?, 'diesel', ?, ?, ?, ?)
    `).run(req.params.id, amount, liters, `Diesel refill - ${liters}L @ ₹${ratePerLiter}/L`, req.user.id);

    // Update total diesel used in trip
    const totalDiesel = await db.prepare('SELECT COALESCE(SUM(liters), 0) as total FROM diesel_refills WHERE trip_id = ?').get(req.params.id);
    const totalDieselAmount = await db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM diesel_refills WHERE trip_id = ?').get(req.params.id);
    
    // Update driver_total_spent to include this refill
    const newDriverSpent = (trip.driver_total_spent || 0) + parseFloat(amount);
    
    await db.prepare(`
      UPDATE trips SET 
        diesel_used_liters = ?, 
        driver_total_spent = COALESCE(?, driver_total_spent),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(totalDiesel.total, newDriverSpent, req.params.id);

    const refills = await db.prepare(`
      SELECT dr.*, u.name as filled_by_name
      FROM diesel_refills dr
      LEFT JOIN users u ON dr.filled_by = u.id
      WHERE dr.trip_id = ?
      ORDER BY dr.created_at
    `).all(req.params.id);

    res.status(201).json(refills);
  } catch (err) {
    console.error('Diesel refill error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get trip history for a vehicle
router.get('/vehicle/:vehicleId/history', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const trips = await db.prepare(`
      SELECT t.*, d.name as driver_name
      FROM trips t
      LEFT JOIN users d ON t.driver_id = d.id
      WHERE t.vehicle_id = ?
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all(req.params.vehicleId);
    res.json(trips);
  } catch (err) {
    console.error('Vehicle history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record collection of pending amount by owner
router.post('/:id/collect-pending', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can collect pending amounts' });
    }

    const { amount } = req.body;
    const collectAmount = amount || trip.pending_amount || 0;

    if (collectAmount <= 0) {
      return res.status(400).json({ error: 'No pending amount to collect' });
    }

    // Record the payment
    await db.prepare(`
      INSERT INTO payments (trip_id, payer_type, amount, payment_type, description, received_by)
      VALUES (?, 'customer', ?, 'balance', 'Pending amount collected by owner', ?)
    `).run(req.params.id, collectAmount, req.user.id);

    // Update trip: mark pending as collected, update balances
    const totalPayments = await db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE trip_id = ?').get(req.params.id);
    const newBalance = Math.max(0, (trip.total_rent || 0) - totalPayments.total);

    await db.prepare(`
      UPDATE trips SET
        advance_amount = ?,
        balance_amount = ?,
        pending_amount = 0,
        pending_amount_collected = ?,
        pending_collected_by = ?,
        pending_collected_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(totalPayments.total, newBalance, collectAmount, req.user.id, req.params.id);

    const updated = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Collect pending error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete trip
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    await db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
    res.json({ message: 'Trip deleted successfully' });
  } catch (err) {
    console.error('Delete trip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: Haversine distance calculation
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

module.exports = router;
