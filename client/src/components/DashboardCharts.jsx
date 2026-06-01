import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart,
} from 'recharts';
import { dashboardAPI } from '../utils/api';
import {
  FiTrendingUp, FiPieChart, FiBarChart2, FiTruck, FiUsers,
  FiDollarSign, FiActivity, FiClock,
} from 'react-icons/fi';

// ---------- Color palette ----------
const COLORS = {
  primary: '#2563eb',
  primaryLight: '#60a5fa',
  green: '#16a34a',
  greenLight: '#86efac',
  orange: '#ea580c',
  orangeLight: '#fdba74',
  red: '#dc2626',
  purple: '#9333ea',
  teal: '#0d9488',
  pink: '#db2777',
  gray: '#6b7280',
  grayLight: '#e5e7eb',
  blue: '#3b82f6',
  yellow: '#ca8a04',
};

const PIE_COLORS = ['#2563eb', '#ea580c', '#dc2626', '#16a34a', '#9333ea', '#6b7280'];
const STATUS_COLORS = {
  planned: '#3b82f6',
  ongoing: '#ca8a04',
  completed: '#16a34a',
  cancelled: '#dc2626',
};

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- Shared tooltip style ----------
const tooltipStyle = {
  contentStyle: {
    background: '#1f2937',
    border: 'none',
    borderRadius: '8px',
    color: '#f9fafb',
    fontSize: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  },
  itemStyle: { padding: '2px 0' },
  labelStyle: { color: '#d1d5db', fontWeight: 600, marginBottom: '4px' },
};

// ================================================================
//  1. REVENUE TREND — Composed bar + line chart
// ================================================================
function RevenueTrendChart({ data, loading }) {
  if (loading) return <ChartSkeleton />;
  if (!data || data.length === 0) return <NoData message="No revenue data for this year" />;

  const chartData = monthNames.map((name, i) => {
    const month = String(i + 1).padStart(2, '0');
    const found = data.find((d) => d.month === month);
    return {
      month: name,
      revenue: found ? Number(found.revenue) : 0,
      trips: found ? Number(found.trips) : 0,
      diesel: found ? Number(found.diesel_used) : 0,
    };
  });

  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Revenue & Diesel Trend</h3>
          <p className="text-xs text-gray-500 mt-0.5">Monthly revenue, diesel used, and trip count</p>
        </div>
        <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          <FiTrendingUp className="w-4 h-4" />
        </span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            domain={[0, maxRevenue * 1.15]}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            domain={[0, 'auto']}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value, name) => {
              if (name === 'revenue') return [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue'];
              if (name === 'trips') return [value, 'Trips'];
              if (name === 'diesel') return [`${Number(value).toLocaleString('en-IN')} L`, 'Diesel Used'];
              return [value, name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            formatter={(value) => {
              if (value === 'revenue') return 'Revenue';
              if (value === 'trips') return 'Trips';
              if (value === 'diesel') return 'Diesel (L)';
              return value;
            }}
          />
          <Bar yAxisId="left" dataKey="revenue" fill={COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} name="revenue" />
          <Bar yAxisId="right" dataKey="diesel" fill={COLORS.orange} radius={[4, 4, 0, 0]} maxBarSize={28} name="diesel" opacity={0.7} />
          <Line
            yAxisId="right"
            dataKey="trips"
            stroke={COLORS.green}
            strokeWidth={2.5}
            dot={{ fill: COLORS.green, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: COLORS.green }}
            name="trips"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ================================================================
//  2. EXPENSE BREAKDOWN — Pie/donut chart
// ================================================================
function ExpenseBreakdownChart({ data, loading }) {
  if (loading) return <ChartSkeleton />;
  if (!data || !data.yearly) return <NoData message="No expense data yet" />;

  const cats = data.yearly;
  const pieData = [
    { name: 'Diesel', value: Number(cats.diesel) || 0 },
    { name: 'Parking', value: Number(cats.parking) || 0 },
    { name: 'Toll', value: Number(cats.toll) || 0 },
    { name: 'Maintenance', value: Number(cats.maintenance) || 0 },
    { name: 'Other', value: Number(cats.other) || 0 },
  ].filter((d) => d.value > 0);

  if (pieData.length === 0) return <NoData message="No expenses recorded" />;

  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Expense Breakdown</h3>
          <p className="text-xs text-gray-500 mt-0.5">Yearly by category</p>
        </div>
        <span className="p-2 bg-orange-50 text-orange-600 rounded-lg">
          <FiPieChart className="w-4 h-4" />
        </span>
      </div>
      <div className="flex flex-col items-center">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {pieData.map((_, i) => (
                <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              {...tooltipStyle}
              formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-1 w-full max-w-xs">
          {pieData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="text-gray-600">{d.name}</span>
              <span className="text-gray-900 font-medium ml-auto">
                ₹{(d.value / 1000).toFixed(1)}k
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Total: <strong>₹{total.toLocaleString('en-IN')}</strong>
        </p>
      </div>
    </div>
  );
}

// ================================================================
//  3. MONTHLY EXPENSE TREND — Stacked bar chart
// ================================================================
function MonthlyExpenseTrendChart({ data, loading }) {
  if (loading) return <ChartSkeleton />;
  if (!data || !data.monthly || data.monthly.length === 0) return <NoData message="No monthly expense data" />;

  const chartData = monthNames.map((name, i) => {
    const month = String(i + 1).padStart(2, '0');
    const found = data.monthly.find((d) => d.month === month);
    return {
      month: name,
      diesel: found ? Number(found.diesel) : 0,
      parking: found ? Number(found.parking) : 0,
      toll: found ? Number(found.toll) : 0,
      maintenance: found ? Number(found.maintenance) : 0,
      other: found ? Number(found.other) : 0,
    };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Expense Trend</h3>
          <p className="text-xs text-gray-500 mt-0.5">Monthly expense categories</p>
        </div>
        <span className="p-2 bg-purple-50 text-purple-600 rounded-lg">
          <FiBarChart2 className="w-4 h-4" />
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value, name) => [`₹${Number(value).toLocaleString('en-IN')}`, name.charAt(0).toUpperCase() + name.slice(1)]}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          />
          <Bar dataKey="diesel" stackId="a" fill={COLORS.primary} radius={[0, 0, 0, 0]} name="Diesel" />
          <Bar dataKey="toll" stackId="a" fill={COLORS.orange} name="Toll" />
          <Bar dataKey="parking" stackId="a" fill={COLORS.red} name="Parking" />
          <Bar dataKey="maintenance" stackId="a" fill={COLORS.green} name="Maintenance" />
          <Bar dataKey="other" stackId="a" fill={COLORS.purple} radius={[4, 4, 0, 0]} name="Other" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ================================================================
//  4. VEHICLE UTILIZATION — Horizontal bar chart
// ================================================================
function VehicleUtilizationChart({ data, loading }) {
  if (loading) return <ChartSkeleton />;
  if (!data || data.length === 0) return <NoData message="No vehicle data" />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Vehicle Utilization</h3>
          <p className="text-xs text-gray-500 mt-0.5">Completed trips per vehicle</p>
        </div>
        <span className="p-2 bg-green-50 text-green-600 rounded-lg">
          <FiTruck className="w-4 h-4" />
        </span>
      </div>
      <div className="space-y-3">
        {data.slice(0, 6).map((v, i) => {
          const maxTrips = Math.max(...data.map((x) => x.total_trips), 1);
          const pct = (v.total_trips / maxTrips) * 100;
          return (
            <div key={v.id || i}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium truncate max-w-[140px]">
                  {v.vehicle_name}
                </span>
                <span className="text-gray-500">
                  {v.total_trips} trips · ₹{Number(v.total_revenue).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
//  5. DRIVER PERFORMANCE — Bar chart
// ================================================================
function DriverPerformanceChart({ data, loading }) {
  if (loading) return <ChartSkeleton />;
  if (!data || data.length === 0) return <NoData message="No driver performance data" />;

  const chartData = data.map((d) => ({
    name: d.name?.split(' ')[0] || 'Driver',
    trips: d.total_trips,
    distance: Math.round(Number(d.total_distance) || 0),
    revenue: Number(d.total_revenue) || 0,
    mileage: Number(d.avg_mileage) || 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Driver Performance</h3>
          <p className="text-xs text-gray-500 mt-0.5">Completed trips by driver</p>
        </div>
        <span className="p-2 bg-teal-50 text-teal-600 rounded-lg">
          <FiUsers className="w-4 h-4" />
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
            width={70}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value, name) => {
              if (name === 'trips') return [value, 'Trips'];
              if (name === 'distance') return [`${value} km`, 'Distance'];
              if (name === 'revenue') return [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue'];
              if (name === 'mileage') return [`${value.toFixed(1)} km/l`, 'Avg Mileage'];
              return [value, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          <Bar dataKey="trips" fill={COLORS.teal} radius={[0, 4, 4, 0]} maxBarSize={24} name="trips" />
        </BarChart>
      </ResponsiveContainer>
      {/* Mini stats cards */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <p className="text-xs text-gray-500">Total Trips</p>
          <p className="text-sm font-bold text-gray-900">{chartData.reduce((s, d) => s + d.trips, 0)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <p className="text-xs text-gray-500">Total Distance</p>
          <p className="text-sm font-bold text-gray-900">{chartData.reduce((s, d) => s + d.distance, 0).toLocaleString()} km</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <p className="text-xs text-gray-500">Avg Mileage</p>
          <p className="text-sm font-bold text-gray-900">
            {data.length > 0 ? (data.reduce((s, d) => s + Number(d.avg_mileage), 0) / data.length).toFixed(1) : 'N/A'} km/l
          </p>
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  6. TRIP STATUS DISTRIBUTION — Pie chart
// ================================================================
function TripStatusChart({ stats, loading }) {
  if (loading) return <ChartSkeleton />;
  if (!stats) return <NoData message="No trip stats" />;

  const pieData = [
    { name: 'Active Now', value: Number(stats.total?.active) || 0, color: STATUS_COLORS.ongoing },
    { name: 'Completed This Month', value: Number(stats.monthly?.completed) || 0, color: STATUS_COLORS.completed },
    { name: 'Total This Month', value: Number(stats.monthly?.trips) || 0, color: COLORS.primaryLight },
  ];

  if (pieData.every((d) => d.value === 0)) return <NoData message="No trip data" />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Trips Overview</h3>
          <p className="text-xs text-gray-500 mt-0.5">Monthly snapshot</p>
        </div>
        <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
          <FiActivity className="w-4 h-4" />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{pieData[0].value}</p>
          <p className="text-xs text-amber-600 mt-0.5">Active Now</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{pieData[1].value}</p>
          <p className="text-xs text-green-600 mt-0.5">Completed</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{pieData[2].value}</p>
          <p className="text-xs text-blue-600 mt-0.5">Total This Month</p>
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  7. MONTHLY REVENUE CARD — Mini stat highlight
// ================================================================
function RevenueHighlightCard({ stats }) {
  if (!stats) return null;
  const thisMonth = Number(stats.monthly?.revenue) || 0;
  const collected = Number(stats.monthly?.collected) || 0;
  const pending = thisMonth - collected;

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dailyAvg = thisMonth / daysInMonth;

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-5 text-white">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-blue-200 font-medium">Monthly Revenue</p>
        <FiDollarSign className="w-5 h-5 text-blue-300" />
      </div>
      <p className="text-2xl font-bold">₹{thisMonth.toLocaleString('en-IN')}</p>
      <div className="flex items-center gap-3 mt-3 text-xs text-blue-200">
        <span className="flex items-center gap-0.5 text-green-300">
          <FiTrendingUp className="w-3 h-3" />
          {collected > 0 ? `${((collected / thisMonth) * 100).toFixed(0)}% collected` : 'No payments yet'}
        </span>
        <span>₹{dailyAvg.toFixed(0)}/day avg</span>
      </div>
      {pending > 0 && (
        <div className="mt-3 pt-3 border-t border-blue-500/30 text-xs text-blue-300">
          Pending collection: <strong className="text-white">₹{pending.toLocaleString('en-IN')}</strong>
        </div>
      )}
    </div>
  );
}

// ================================================================
//  8. LOADING & EMPTY STATES
// ================================================================
function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
        </div>
        <div className="h-8 w-8 bg-gray-100 rounded-lg" />
      </div>
      <div className="h-52 bg-gray-50 rounded-lg" />
    </div>
  );
}

function NoData({ message }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-col items-center justify-center h-52 text-gray-400">
        <FiBarChart2 className="w-8 h-8 mb-2" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

// ================================================================
//  MAIN EXPORT — DashboardCharts
// ================================================================
export default function DashboardCharts({ stats }) {
  const [revenueData, setRevenueData] = useState(null);
  const [expenseData, setExpenseData] = useState(null);
  const [vehicleData, setVehicleData] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChartData();
  }, [year]);

  const [error, setError] = useState(null);

  const loadChartData = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        dashboardAPI.getRevenueChart({ year }),
        dashboardAPI.getExpenseBreakdown({ year }),
        dashboardAPI.getVehicleUtilization(),
        dashboardAPI.getDriverPerformance(),
      ]);

      setRevenueData(results[0].status === 'fulfilled' ? results[0].value.data : null);
      setExpenseData(results[1].status === 'fulfilled' ? results[1].value.data : null);
      setVehicleData(results[2].status === 'fulfilled' ? results[2].value.data : null);
      setDriverData(results[3].status === 'fulfilled' ? results[3].value.data : null);

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        console.error('Some chart data failed to load:', failures.map((f) => f.reason));
        setError(`${failures.length} chart(s) failed to load`);
      }
    } catch (err) {
      console.error('Failed to load chart data:', err);
      setError('Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FiBarChart2 className="w-5 h-5 text-primary-500" />
            Analytics & Insights
          </h2>
          <p className="text-sm text-gray-500">Visualize revenue, expenses, and operational metrics</p>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-500 mr-2">{error}</span>
          )}
          <button
            onClick={() => setYear(year - 1)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            ← Prev
          </button>
          <span className="text-sm font-semibold text-gray-700 w-16 text-center">{year}</span>
          <button
            onClick={() => setYear(year + 1)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Revenue highlight + Trip Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1">
          <RevenueHighlightCard stats={stats} />
        </div>
        <div className="md:col-span-1">
          <TripStatusChart stats={stats} loading={!stats} />
        </div>
        <div className="md:col-span-2">
          <VehicleUtilizationChart data={vehicleData} loading={loading} />
        </div>
      </div>

      {/* Revenue + Expense Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueTrendChart data={revenueData} loading={loading} />
        <ExpenseBreakdownChart data={expenseData} loading={loading} />
      </div>

      {/* Expense Trend + Driver Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthlyExpenseTrendChart data={expenseData} loading={loading} />
        <DriverPerformanceChart data={driverData} loading={loading} />
      </div>
    </div>
  );
}
