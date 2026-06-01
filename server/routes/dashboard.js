const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get dashboard stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = String(now.getFullYear());

    let userFilter = '';
    let userParams = [];
    if (req.user.role === 'driver') {
      userFilter = ' AND driver_id = ?';
      userParams.push(req.user.id);
    } else if (req.user.role === 'partner') {
      userFilter = ' AND partner_id = ?';
      userParams.push(req.user.id);
    }

    // Monthly stats - using substr for date comparison since sql.js doesn't have strftime
    const monthlyTrips = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_rent), 0) as revenue
      FROM trips WHERE substr(start_date, 1, 7) = ? ${userFilter}
    `).get(`${currentYear}-${currentMonth}`, ...userParams);

    // Yearly stats
    const yearlyTrips = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_rent), 0) as revenue
      FROM trips WHERE substr(start_date, 1, 4) = ? ${userFilter}
    `).get(currentYear, ...userParams);

    // Total stats
    const totalTrips = await db.prepare(`
      SELECT COUNT(*) as count FROM trips WHERE 1=1 ${userFilter}
    `).get(...userParams);

    // Active trips
    const activeTrips = await db.prepare(`
      SELECT COUNT(*) as count FROM trips WHERE status = 'ongoing' ${userFilter}
    `).get(...userParams);

    // Diesel stats — sum from trip_expenses (covers both diesel refill form and manual diesel expenses)
    const dieselStats = await db.prepare(`
      SELECT COALESCE(SUM(e.liters), 0) as total_diesel_used
      FROM trip_expenses e
      JOIN trips t ON e.trip_id = t.id
      WHERE e.expense_type = 'diesel' AND substr(t.start_date, 1, 4) = ? ${userFilter.replace('driver_id', 't.driver_id').replace('partner_id', 't.partner_id')}
    `).get(currentYear, ...userParams);

    // Revenue collected (payments)
    const paymentsMonthly = await db.prepare(`
      SELECT COALESCE(SUM(p.amount), 0) as total_collected
      FROM payments p
      JOIN trips t ON p.trip_id = t.id
      WHERE substr(t.start_date, 1, 7) = ? ${userFilter}
    `).get(`${currentYear}-${currentMonth}`, ...userParams);

    // Balance to collect — include ANY non-cancelled trip with balance_amount > 0
    // This covers: planned/ongoing trips with balance, AND completed trips that have 
    // outstanding balance (regardless of whether pending_amount flag was set)
    const totalBalance = (await db.prepare(`
      SELECT COALESCE(SUM(balance_amount), 0) as total_balance
      FROM trips WHERE status IN ('planned', 'ongoing', 'completed') AND COALESCE(balance_amount, 0) > 0 ${userFilter}
    `).get(...userParams)).total_balance;

    // Completed trips this month
    const completedMonthly = await db.prepare(`
      SELECT COUNT(*) as count FROM trips
      WHERE status = 'completed' AND substr(start_date, 1, 7) = ? ${userFilter}
    `).get(`${currentYear}-${currentMonth}`, ...userParams);

    // Maintenance costs this year
    const maintenanceCosts = await db.prepare(`
      SELECT COALESCE(SUM(cost), 0) as total
      FROM maintenance_logs
      WHERE substr(maintenance_date, 1, 4) = ?
    `).get(currentYear);

    // Total expenses this month — fix userFilter to use proper table prefix
    const monthlyExpenses = await db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN e.expense_type = 'diesel' THEN e.amount END), 0) as diesel_cost,
        COALESCE(SUM(CASE WHEN e.expense_type = 'parking' THEN e.amount END), 0) as parking_cost,
        COALESCE(SUM(CASE WHEN e.expense_type = 'toll' THEN e.amount END), 0) as toll_cost,
        COALESCE(SUM(CASE WHEN e.expense_type = 'maintenance' THEN e.amount END), 0) as maintenance_cost,
        COALESCE(SUM(CASE WHEN e.expense_type = 'food' THEN e.amount END), 0) as food_cost,
        COALESCE(SUM(CASE WHEN e.expense_type NOT IN ('diesel','parking','toll','maintenance','food') THEN e.amount END), 0) as other_cost,
        COALESCE(SUM(e.amount), 0) as total_expenses
      FROM trip_expenses e
      JOIN trips t ON e.trip_id = t.id
      WHERE substr(t.start_date, 1, 7) = ? ${userFilter.replace('driver_id', 't.driver_id').replace('partner_id', 't.partner_id')}
    `).get(`${currentYear}-${currentMonth}`, ...userParams);

    const today = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, '0')}`;

    const upcomingTrips = await db.prepare(`
      SELECT t.id, t.title, t.start_date, t.end_date, t.total_rent, t.status,
        v.vehicle_name, d.name as driver_name, p.name as partner_name
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN users d ON t.driver_id = d.id
      LEFT JOIN users p ON t.partner_id = p.id
      WHERE t.start_date >= ? AND t.status IN ('planned', 'ongoing') ${userFilter}
      ORDER BY t.start_date ASC
      LIMIT 10
    `).all(today, ...userParams);

    // Recent trips
    const recentTrips = await db.prepare(`
      SELECT t.id, t.title, t.start_date, t.end_date, t.total_rent, t.status,
        v.vehicle_name, d.name as driver_name
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN users d ON t.driver_id = d.id
      WHERE 1=1 ${userFilter}
      ORDER BY t.created_at DESC
      LIMIT 10
    `).all(...userParams);

    res.json({
      monthly: {
        trips: monthlyTrips.count,
        revenue: monthlyTrips.revenue,
        completed: completedMonthly.count,
        collected: paymentsMonthly.total_collected,
        expenses: monthlyExpenses,
      },
      yearly: {
        trips: yearlyTrips.count,
        revenue: yearlyTrips.revenue,
        diesel_used: dieselStats.total_diesel_used,
        maintenance: maintenanceCosts.total,
      },
      total: {
        trips: totalTrips.count,
        active: activeTrips.count,
        balance_to_collect: totalBalance,
      },
      upcoming: upcomingTrips,
      recent: recentTrips,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get monthly revenue data for charts
router.get('/revenue-chart', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const year = req.query.year || new Date().getFullYear();

    let userFilter = '';
    let userParams = [];
    if (req.user.role === 'driver') {
      userFilter = ' AND driver_id = ?';
      userParams.push(req.user.id);
    } else if (req.user.role === 'partner') {
      userFilter = ' AND partner_id = ?';
      userParams.push(req.user.id);
    }

    // Diesel used by month — sum liters from trip_expenses (covers both refill form and manual expenses)
    const dieselByMonth = await db.prepare(`
      SELECT 
        substr(t.start_date, 6, 2) as month,
        COALESCE(SUM(e.liters), 0) as diesel_used
      FROM trip_expenses e
      JOIN trips t ON e.trip_id = t.id
      WHERE e.expense_type = 'diesel' AND substr(t.start_date, 1, 4) = ? ${userFilter.replace('driver_id', 't.driver_id').replace('partner_id', 't.partner_id')}
      GROUP BY substr(t.start_date, 6, 2)
      ORDER BY month
    `).all(String(year), ...userParams);

    // Monthly trip counts and revenue
    const monthlyData = await db.prepare(`
      SELECT 
        substr(start_date, 6, 2) as month,
        COUNT(*) as trips,
        COALESCE(SUM(total_rent), 0) as revenue
      FROM trips
      WHERE substr(start_date, 1, 4) = ? ${userFilter}
      GROUP BY substr(start_date, 6, 2)
      ORDER BY month
    `).all(String(year), ...userParams);

    // Merge diesel data into monthly data
    const dieselMap = {};
    for (const d of dieselByMonth) {
      dieselMap[d.month] = Number(d.diesel_used);
    }
    for (const row of monthlyData) {
      row.diesel_used = dieselMap[row.month] || 0;
    }

    res.json(monthlyData);
  } catch (err) {
    console.error('Revenue chart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get vehicle utilization stats
router.get('/vehicle-utilization', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const stats = await db.prepare(`
      SELECT 
        v.id, v.vehicle_name, v.registration_number,
        COUNT(t.id) as total_trips,
        COALESCE(SUM(t.total_rent), 0) as total_revenue,
        COALESCE(SUM(t.total_distance_km), 0) as total_distance,
        COALESCE(SUM(t.diesel_used_liters), 0) as total_diesel
      FROM vehicles v
      LEFT JOIN trips t ON v.id = t.vehicle_id AND t.status = 'completed'
      GROUP BY v.id
      ORDER BY total_trips DESC
    `).all();
    res.json(stats);
  } catch (err) {
    console.error('Vehicle utilization error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get driver performance stats
router.get('/driver-performance', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const stats = await db.prepare(`
      SELECT 
        u.id, u.name,
        COUNT(t.id) as total_trips,
        COALESCE(SUM(t.total_distance_km), 0) as total_distance,
        COALESCE(AVG(t.mileage), 0) as avg_mileage,
        COALESCE(SUM(t.total_rent), 0) as total_revenue
      FROM users u
      JOIN trips t ON u.id = t.driver_id AND t.status = 'completed'
      WHERE u.role = 'driver'
      GROUP BY u.id
      ORDER BY total_trips DESC
    `).all();
    res.json(stats);
  } catch (err) {
    console.error('Driver performance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get expense breakdown by category for the year (for charts)
router.get('/expense-breakdown', authenticateToken, async (req, res) => {
  try {
    const db = req.db;
    const year = req.query.year || new Date().getFullYear();

    let userFilter = '';
    let userParams = [];
    if (req.user.role === 'driver') {
      userFilter = ' AND t.driver_id = ?';
      userParams.push(req.user.id);
    } else if (req.user.role === 'partner') {
      userFilter = ' AND t.partner_id = ?';
      userParams.push(req.user.id);
    }

    // Monthly expense breakdown for the year
    const monthlyData = await db.prepare(`
      SELECT 
        substr(t.start_date, 6, 2) as month,
        COALESCE(SUM(CASE WHEN e.expense_type = 'diesel' THEN e.amount END), 0) as diesel,
        COALESCE(SUM(CASE WHEN e.expense_type = 'parking' THEN e.amount END), 0) as parking,
        COALESCE(SUM(CASE WHEN e.expense_type = 'toll' THEN e.amount END), 0) as toll,
        COALESCE(SUM(CASE WHEN e.expense_type = 'maintenance' THEN e.amount END), 0) as maintenance,
        COALESCE(SUM(CASE WHEN e.expense_type NOT IN ('diesel','parking','toll','maintenance') THEN e.amount END), 0) as other,
        COALESCE(SUM(e.amount), 0) as total
      FROM trip_expenses e
      JOIN trips t ON e.trip_id = t.id
      WHERE substr(t.start_date, 1, 4) = ? ${userFilter}
      GROUP BY substr(t.start_date, 6, 2)
      ORDER BY month
    `).all(String(year), ...userParams);

    // Yearly category totals
    const yearlyTotals = await db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN e.expense_type = 'diesel' THEN e.amount END), 0) as diesel,
        COALESCE(SUM(CASE WHEN e.expense_type = 'parking' THEN e.amount END), 0) as parking,
        COALESCE(SUM(CASE WHEN e.expense_type = 'toll' THEN e.amount END), 0) as toll,
        COALESCE(SUM(CASE WHEN e.expense_type = 'maintenance' THEN e.amount END), 0) as maintenance,
        COALESCE(SUM(CASE WHEN e.expense_type NOT IN ('diesel','parking','toll','maintenance') THEN e.amount END), 0) as other,
        COALESCE(SUM(e.amount), 0) as total
      FROM trip_expenses e
      JOIN trips t ON e.trip_id = t.id
      WHERE substr(t.start_date, 1, 4) = ? ${userFilter}
    `).get(String(year), ...userParams);

    res.json({ monthly: monthlyData, yearly: yearlyTotals });
  } catch (err) {
    console.error('Expense breakdown error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
