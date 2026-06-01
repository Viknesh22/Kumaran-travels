import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI, isCloudConnection } from '../utils/api';
import DashboardCharts from './DashboardCharts';
import { FiCalendar, FiDollarSign, FiTruck, FiActivity, FiClock, FiBarChart2, FiUsers, FiArrowRight, FiCloud, FiServer } from 'react-icons/fi';

const statCardColors = {
  blue: 'bg-blue-50 text-blue-600 border-blue-200',
  green: 'bg-green-50 text-green-600 border-green-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
  orange: 'bg-orange-50 text-orange-600 border-orange-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  teal: 'bg-teal-50 text-teal-600 border-teal-200',
};

export default function Dashboard() {
  const { user, isOwner, isPartner, isDriver } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCloud] = useState(() => isCloudConnection());

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await dashboardAPI.getStats();
      setStats(res.data);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-3 text-gray-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
        {error}
        <button onClick={loadStats} className="ml-2 underline">Retry</button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-6 lg:p-8 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl lg:text-3xl font-bold">
                Welcome, {user?.name?.split(' ')[0]}! 👋
              </h1>
              <ConnectionBadge isCloud={isCloud} />
            </div>
            <p className="text-primary-200 mt-1 text-sm lg:text-base">
              {isOwner ? 'Here\'s your business overview for today.' : isPartner ? 'Track your partnered trips and earnings.' : 'View your assigned trips and log details.'}
            </p>
          </div>
          {(isOwner || isPartner) && (
            <Link to="/trips/new" className="hidden sm:flex btn-primary bg-white text-primary-700 hover:bg-primary-50">
              + Create New Trip
            </Link>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FiCalendar}
          label="This Month"
          value={`${stats.monthly.trips} Trips`}
          subvalue={`₹${(stats.monthly.revenue || 0).toLocaleString()} revenue`}
          color="blue"
        />
        <StatCard
          icon={FiDollarSign}
          label="Collected"
          value={`₹${(stats.monthly.collected || 0).toLocaleString()}`}
          subvalue={`${stats.monthly.completed} trips completed`}
          color="green"
        />
        <StatCard
          icon={FiActivity}
          label="Balance Due"
          value={`₹${(stats.total.balance_to_collect || 0).toLocaleString()}`}
          subvalue="Pending collection"
          color="orange"
        />
        <StatCard
          icon={FiTruck}
          label="Active Trips"
          value={stats.total.active}
          subvalue={`${stats.yearly.trips} trips this year`}
          color="purple"
        />
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Overview */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Monthly Overview</h3>
            <FiBarChart2 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <OverviewItem label="Total Revenue" value={`₹${(stats.monthly.revenue || 0).toLocaleString()}`} color="text-green-600" />
            <OverviewItem label="Total Collected" value={`₹${(stats.monthly.collected || 0).toLocaleString()}`} color="text-blue-600" />
            <OverviewItem label="Diesel Cost" value={`₹${(stats.monthly.expenses?.diesel_cost || 0).toLocaleString()}`} color="text-orange-600" />
            <OverviewItem label="Toll Charges" value={`₹${(stats.monthly.expenses?.toll_cost || 0).toLocaleString()}`} color="text-red-600" />
            <OverviewItem label="Parking Charges" value={`₹${(stats.monthly.expenses?.parking_cost || 0).toLocaleString()}`} color="text-purple-600" />
            <OverviewItem label="Maintenance" value={`₹${(stats.monthly.expenses?.maintenance_cost || 0).toLocaleString()}`} color="text-gray-600" />
            <div className="col-span-2 border-t border-gray-200 pt-3 mt-1">
              <OverviewItem label="Total Expenses" value={`₹${(stats.monthly.expenses?.total_expenses || 0).toLocaleString()}`} color="text-red-700 font-bold" />
            </div>
            <div className="col-span-2 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-3 -mx-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">Net Profit</span>
                <span className={`text-lg font-bold ${((stats.monthly.revenue || 0) - (stats.monthly.expenses?.total_expenses || 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{((stats.monthly.revenue || 0) - (stats.monthly.expenses?.total_expenses || 0)).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Revenue minus all trip expenses</p>
            </div>
          </div>
        </div>

        {/* Yearly Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Yearly Summary</h3>
            <FiBarChart2 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            <OverviewItem label="Total Trips" value={stats.yearly.trips} color="text-blue-600" />
            <OverviewItem label="Total Revenue" value={`₹${(stats.yearly.revenue || 0).toLocaleString()}`} color="text-green-600" />
            <OverviewItem label="Diesel Used" value={`${(stats.yearly.diesel_used || 0).toFixed(1)} Liters`} color="text-orange-600" />
            <OverviewItem label="Maintenance Cost" value={`₹${(stats.yearly.maintenance || 0).toLocaleString()}`} color="text-red-600" />
            <OverviewItem label="Net Revenue" value={`₹${((stats.yearly.revenue || 0) - (stats.yearly.maintenance || 0)).toLocaleString()}`} color="text-purple-600" />
          </div>
        </div>
      </div>

      {/* Upcoming Trips & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Trips */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FiClock className="w-4 h-4 text-blue-500" />
              Upcoming Trips
            </h3>
            <Link to="/trips" className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              View all <FiArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {stats.upcoming?.length > 0 ? (
            <div className="space-y-3">
              {stats.upcoming.map((trip) => (
                <Link key={trip.id} to={`/trips/${trip.id}`}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{trip.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-400">{trip.vehicle_name} {trip.driver_name ? `• ${trip.driver_name}` : ''}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-gray-900">₹{(trip.total_rent || 0).toLocaleString()}</p>
                    <span className={`status-badge ${trip.status === 'planned' ? 'status-planned' : 'status-ongoing'}`}>
                      {trip.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <FiCalendar className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">No upcoming trips</p>
            </div>
          )}
        </div>

        {/* Recent Trips */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FiActivity className="w-4 h-4 text-green-500" />
              Recent Trips
            </h3>
            <Link to="/trips" className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              View all <FiArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {stats.recent?.length > 0 ? (
            <div className="space-y-3">
              {stats.recent.map((trip) => (
                <Link key={trip.id} to={`/trips/${trip.id}`}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{trip.title}</p>
                    <p className="text-xs text-gray-500">{trip.vehicle_name}</p>
                  </div>
                  <div className="text-right ml-4">
                    <span className={`status-badge ${trip.status === 'completed' ? 'status-completed' : trip.status === 'ongoing' ? 'status-ongoing' : 'status-planned'}`}>
                      {trip.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <FiTruck className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">No recent trips</p>
            </div>
          )}
        </div>
      </div>

      {/* Analytics & Charts */}
      <DashboardCharts stats={stats} />

      {/* Driver-specific section */}
      {isDriver && (
        <div className="bg-gradient-to-r from-green-500 to-green-700 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Driver Quick Actions</h3>
              <p className="text-green-100 text-sm mt-1">Update trip details, log kilometers, and record expenses</p>
            </div>
            <Link to="/trips?status=ongoing" className="bg-white text-green-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50">
              View Active Trips
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({ isCloud }) {
  if (isCloud) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 backdrop-blur-sm">
        <FiCloud className="w-3 h-3" />
        Cloud
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/70 border border-white/10 backdrop-blur-sm">
      <FiServer className="w-3 h-3" />
      Local
    </span>
  );
}

function StatCard({ icon: Icon, label, value, subvalue, color }) {
  const colorClasses = statCardColors[color] || statCardColors.blue;
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 lg:p-5 card-hover`}>
      <div className="flex items-start justify-between mb-3">
        <span className={`inline-flex p-2 rounded-lg ${colorClasses}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-lg lg:text-xl font-bold text-gray-900 mt-0.5">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{subvalue}</p>
    </div>
  );
}

function OverviewItem({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}
