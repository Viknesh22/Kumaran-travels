import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tripsAPI } from '../utils/api';
import { FiSearch, FiFilter, FiPlus, FiEye, FiEdit2, FiTrash2, FiChevronDown, FiCalendar, FiTruck, FiDollarSign, FiMapPin } from 'react-icons/fi';

export default function TripList() {
  const { user, isOwner, isPartner, isDriver } = useAuth();
  const [searchParams] = useSearchParams();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    search: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadTrips();
  }, [filters.status]);

  const loadTrips = async () => {
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      const res = await tripsAPI.getAll(params);
      setTrips(res.data);
    } catch (err) {
      console.error('Failed to load trips:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this trip?')) return;
    try {
      await tripsAPI.delete(id);
      setTrips(trips.filter(t => t.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filteredTrips = trips.filter(trip => {
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return trip.title?.toLowerCase().includes(search) ||
        trip.vehicle_name?.toLowerCase().includes(search) ||
        trip.driver_name?.toLowerCase().includes(search);
    }
    return true;
  });

  const statusCounts = {
    all: trips.length,
    planned: trips.filter(t => t.status === 'planned').length,
    ongoing: trips.filter(t => t.status === 'ongoing').length,
    completed: trips.filter(t => t.status === 'completed').length,
    cancelled: trips.filter(t => t.status === 'cancelled').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trips</h1>
          <p className="text-sm text-gray-500 mt-1">{trips.length} total trips</p>
        </div>
        {(isOwner || isPartner) && (
          <Link to="/trips/new" className="btn-primary">
            <FiPlus className="w-4 h-4 mr-2" />
            New Trip
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search trips by title, vehicle, or driver..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input-field pl-10"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary text-sm"
          >
            <FiFilter className="w-4 h-4 mr-2" />
            Filters
            <FiChevronDown className={`w-3 h-3 ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: '', label: 'All', count: statusCounts.all },
            { key: 'planned', label: 'Planned', count: statusCounts.planned },
            { key: 'ongoing', label: 'Ongoing', count: statusCounts.ongoing },
            { key: 'completed', label: 'Completed', count: statusCounts.completed },
            { key: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilters({ ...filters, status: key })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filters.status === key
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Trips List */}
      {filteredTrips.length > 0 ? (
        <div className="space-y-3">
          {filteredTrips.map((trip) => (
            <div key={trip.id} className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5 card-hover">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FiTruck className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <Link to={`/trips/${trip.id}`} className="text-base font-semibold text-gray-900 hover:text-primary-600">
                        {trip.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        <span className="text-sm text-gray-500 flex items-center gap-1">
                          <FiCalendar className="w-3.5 h-3.5" />
                          {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
                        </span>
                        <span className="text-sm text-gray-500">{trip.vehicle_name}</span>
                        {trip.driver_name && (
                          <span className="text-sm text-gray-400">Driver: {trip.driver_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 lg:flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">₹{(trip.total_rent || 0).toLocaleString()}</p>
                    {trip.balance_amount > 0 && (
                      <p className="text-xs text-orange-600">Balance: ₹{(trip.balance_amount || 0).toLocaleString()}</p>
                    )}
                  </div>
                  <span className={`status-badge ${trip.status === 'planned' ? 'status-planned' : trip.status === 'ongoing' ? 'status-ongoing' : trip.status === 'completed' ? 'status-completed' : 'status-cancelled'}`}>
                    {trip.status}
                  </span>
                  <div className="flex items-center gap-1">
                    <Link to={`/trips/${trip.id}`} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                      <FiEye className="w-4 h-4" />
                    </Link>
                    {(isOwner || isPartner) && (
                      <>
                        <Link to={`/trips/${trip.id}/edit`} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <FiEdit2 className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handleDelete(trip.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FiTruck className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No trips found</h3>
          <p className="text-sm text-gray-500 mb-4">
            {filters.status ? `No ${filters.status} trips` : 'Get started by creating your first trip'}
          </p>
          {(isOwner || isPartner) && (
            <Link to="/trips/new" className="btn-primary">
              <FiPlus className="w-4 h-4 mr-2" />
              Create First Trip
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
