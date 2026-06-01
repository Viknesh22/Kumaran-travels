const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { generateToken, authenticateToken } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    const db = req.db;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    if (!['owner', 'partner', 'driver'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be owner, partner, or driver' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await db.prepare(
      'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, hashedPassword, phone || null, role);

    const user = await db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = req.db;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const user = await db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users (for dropdowns)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const { role } = req.query;
    let query = 'SELECT id, name, email, phone, role FROM users';
    const params = [];
    if (role) {
      query += ' WHERE role = ?';
      params.push(role);
    }
    query += ' ORDER BY name';
    const users = await db.prepare(query).all(...params);
    res.json(users);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user
router.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    // Only owner can update users
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can manage users' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, email, phone, role, password } = req.body;

    // Check email uniqueness if changed
    if (email && email !== user.email) {
      const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.params.id);
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    let updateFields = [];
    let updateParams = [];

    if (name !== undefined) { updateFields.push('name = ?'); updateParams.push(name); }
    if (email !== undefined) { updateFields.push('email = ?'); updateParams.push(email); }
    if (phone !== undefined) { updateFields.push('phone = ?'); updateParams.push(phone); }
    if (role !== undefined) { updateFields.push('role = ?'); updateParams.push(role); }
    if (password) {
      const hashedPassword = require('bcryptjs').hashSync(password, 10);
      updateFields.push('password = ?');
      updateParams.push(hashedPassword);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateParams.push(req.params.id);
    await db.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateParams);

    const updated = await db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset user password (dedicated endpoint — no other fields required)
router.post('/users/:id/reset-password', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can reset passwords' });
    }

    const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.params.id);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    // Only owner can delete users
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can manage users' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
