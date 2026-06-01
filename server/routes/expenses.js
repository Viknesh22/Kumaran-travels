const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get expenses for a trip
router.get('/trip/:tripId', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const expenses = await db.prepare(`
      SELECT e.*, u.name as paid_by_name
      FROM trip_expenses e
      LEFT JOIN users u ON e.paid_by = u.id
      WHERE e.trip_id = ?
      ORDER BY e.created_at DESC
    `).all(req.params.tripId);
    res.json(expenses);
  } catch (err) {
    console.error('Trip expenses error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add expense to a trip
router.post('/trip/:tripId', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { expense_type, amount, liters, description } = req.body;
    if (!expense_type || !amount) {
      return res.status(400).json({ error: 'Expense type and amount are required' });
    }

    await db.prepare(`
      INSERT INTO trip_expenses (trip_id, expense_type, amount, liters, description, paid_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.tripId, expense_type, amount, liters || null, description || null, req.user.id);

    // If this is a diesel expense with liters, update trips.diesel_used_liters
    if (expense_type === 'diesel' && liters) {
      const totalDieselLiters = await db.prepare(`
        SELECT COALESCE(SUM(liters), 0) as total FROM trip_expenses 
        WHERE trip_id = ? AND expense_type = 'diesel'
      `).get(req.params.tripId);
      await db.prepare('UPDATE trips SET diesel_used_liters = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(totalDieselLiters.total, req.params.tripId);
    }

    const expenses = await db.prepare('SELECT * FROM trip_expenses WHERE trip_id = ? ORDER BY created_at DESC').all(req.params.tripId);
    res.status(201).json(expenses);
  } catch (err) {
    console.error('Add expense error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update expense
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { expense_type, amount, liters, description } = req.body;
    
    // Get the expense before updating to know the trip_id
    const oldExpense = await db.prepare('SELECT * FROM trip_expenses WHERE id = ?').get(req.params.id);
    if (!oldExpense) return res.status(404).json({ error: 'Expense not found' });

    await db.prepare(`
      UPDATE trip_expenses SET expense_type = ?, amount = ?, liters = ?, description = ?
      WHERE id = ?
    `).run(expense_type, amount, liters || null, description || null, req.params.id);

    // If this is a diesel expense, recalculate trips.diesel_used_liters
    if (expense_type === 'diesel' || oldExpense.expense_type === 'diesel') {
      const totalDieselLiters = await db.prepare(`
        SELECT COALESCE(SUM(liters), 0) as total FROM trip_expenses 
        WHERE trip_id = ? AND expense_type = 'diesel'
      `).get(oldExpense.trip_id);
      await db.prepare('UPDATE trips SET diesel_used_liters = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(totalDieselLiters.total, oldExpense.trip_id);
    }

    const expense = await db.prepare('SELECT * FROM trip_expenses WHERE id = ?').get(req.params.id);
    res.json(expense);
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete expense
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const expense = await db.prepare('SELECT * FROM trip_expenses WHERE id = ?').get(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    await db.prepare('DELETE FROM trip_expenses WHERE id = ?').run(req.params.id);

    // If this was a diesel expense, recalculate trips.diesel_used_liters
    if (expense.expense_type === 'diesel') {
      const totalDieselLiters = await db.prepare(`
        SELECT COALESCE(SUM(liters), 0) as total FROM trip_expenses 
        WHERE trip_id = ? AND expense_type = 'diesel'
      `).get(expense.trip_id);
      await db.prepare('UPDATE trips SET diesel_used_liters = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(totalDieselLiters.total, expense.trip_id);
    }

    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get payments for a trip
router.get('/payments/trip/:tripId', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const payments = await db.prepare(`
      SELECT p.*, u.name as received_by_name
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.trip_id = ?
      ORDER BY p.created_at DESC
    `).all(req.params.tripId);
    res.json(payments);
  } catch (err) {
    console.error('Payments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add payment to a trip
router.post('/payments/trip/:tripId', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { payer_type, amount, payment_type, description } = req.body;
    if (!amount || !payment_type) {
      return res.status(400).json({ error: 'Amount and payment type are required' });
    }

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    await db.prepare(`
      INSERT INTO payments (trip_id, payer_type, amount, payment_type, description, received_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.tripId, payer_type || 'customer', amount, payment_type, description || null, req.user.id);

    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const payerType = payer_type || 'customer';

    if (payerType === 'driver') {
      // Driver payment: reduce driver_starting_cash instead of trip balance
      // This means the driver is returning some of the cash they started with
      const newDriverCash = Math.max(0, (trip.driver_starting_cash || 0) - amountVal);
      await db.prepare('UPDATE trips SET driver_starting_cash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newDriverCash, req.params.tripId);
    } else {
      // Customer or partner payment: update trip balance
      const totalPayments = await db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE trip_id = ?').get(req.params.tripId);
      const newBalance = (trip.total_rent || 0) - totalPayments.total;
      await db.prepare('UPDATE trips SET advance_amount = ?, balance_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(totalPayments.total, Math.max(0, newBalance), req.params.tripId);
    }

    const payments = await db.prepare('SELECT * FROM payments WHERE trip_id = ? ORDER BY created_at DESC').all(req.params.tripId);
    res.status(201).json(payments);
  } catch (err) {
    console.error('Add payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete payment
router.delete('/payments/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    await db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);

    // Recalculate trip balance
    const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(payment.trip_id);
    const totalPayments = await db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE trip_id = ?').get(payment.trip_id);
    const newBalance = trip.total_rent - (totalPayments.total || 0);
    await db.prepare('UPDATE trips SET advance_amount = ?, balance_amount = ? WHERE id = ?')
      .run(totalPayments.total || 0, Math.max(0, newBalance), payment.trip_id);

    res.json({ message: 'Payment deleted' });
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all maintenance logs
router.get('/maintenance', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const logs = await db.prepare(`
      SELECT m.*, v.vehicle_name, v.registration_number, u.name as created_by_name
      FROM maintenance_logs m
      JOIN vehicles v ON m.vehicle_id = v.id
      LEFT JOIN users u ON m.created_by = u.id
      ORDER BY m.maintenance_date DESC
    `).all();
    res.json(logs);
  } catch (err) {
    console.error('Maintenance logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add maintenance log
router.post('/maintenance', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { vehicle_id, description, cost, maintenance_date, next_maintenance_km, current_km_reading } = req.body;
    if (!vehicle_id || !description || !cost || !maintenance_date) {
      return res.status(400).json({ error: 'Vehicle, description, cost, and date are required' });
    }

    await db.prepare(`
      INSERT INTO maintenance_logs (vehicle_id, description, cost, maintenance_date, next_maintenance_km, current_km_reading, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(vehicle_id, description, cost, maintenance_date, next_maintenance_km || null, current_km_reading || null, req.user.id);

    const logs = await db.prepare('SELECT * FROM maintenance_logs ORDER BY maintenance_date DESC').all();
    res.status(201).json(logs);
  } catch (err) {
    console.error('Add maintenance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
