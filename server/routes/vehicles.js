const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');

// Get all vehicles
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    let vehicles;
    if (req.user.role === 'owner') {
      vehicles = await db.prepare(`
        SELECT v.*, u.name as owner_name,
          (SELECT COUNT(*) FROM trips WHERE vehicle_id = v.id AND status = 'ongoing') as active_trips
        FROM vehicles v
        JOIN users u ON v.owner_id = u.id
        ORDER BY v.vehicle_name
      `).all();
    } else {
      vehicles = await db.prepare(`
        SELECT v.*, u.name as owner_name,
          (SELECT COUNT(*) FROM trips WHERE vehicle_id = v.id AND status = 'ongoing') as active_trips
        FROM vehicles v
        JOIN users u ON v.owner_id = u.id
        WHERE v.is_active = 1
        ORDER BY v.vehicle_name
      `).all();
    }
    res.json(vehicles);
  } catch (err) {
    console.error('Vehicles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single vehicle
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const vehicle = await db.prepare(`
      SELECT v.*, u.name as owner_name
      FROM vehicles v
      JOIN users u ON v.owner_id = u.id
      WHERE v.id = ?
    `).get(req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(vehicle);
  } catch (err) {
    console.error('Vehicle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create vehicle
router.post('/', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const db = req.db;
    const { registration_number, vehicle_name, capacity, mileage_kmpl } = req.body;
    if (!registration_number || !vehicle_name) {
      return res.status(400).json({ error: 'Registration number and vehicle name are required' });
    }

    const existing = await db.prepare('SELECT id FROM vehicles WHERE registration_number = ?').get(registration_number);
    if (existing) {
      return res.status(409).json({ error: 'Vehicle with this registration number already exists' });
    }

    const result = await db.prepare(
      'INSERT INTO vehicles (registration_number, vehicle_name, owner_id, capacity, mileage_kmpl) VALUES (?, ?, ?, ?, ?)'
    ).run(registration_number, vehicle_name, req.user.id, capacity || 12, mileage_kmpl || 0);

    const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(vehicle);
  } catch (err) {
    console.error('Create vehicle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update vehicle
router.put('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const db = req.db;
    const { registration_number, vehicle_name, capacity, is_active } = req.body;
    
    const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found or unauthorized' });

    await db.prepare(`
      UPDATE vehicles SET registration_number = ?, vehicle_name = ?, capacity = ?, mileage_kmpl = ?, is_active = ?
      WHERE id = ?
    `).run(
      registration_number || vehicle.registration_number,
      vehicle_name || vehicle.vehicle_name,
      capacity || vehicle.capacity,
      mileage_kmpl !== undefined ? mileage_kmpl : vehicle.mileage_kmpl,
      is_active !== undefined ? is_active : vehicle.is_active,
      req.params.id
    );

    const updated = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update vehicle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete vehicle
router.delete('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const db = req.db;
    const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found or unauthorized' });

    await db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
