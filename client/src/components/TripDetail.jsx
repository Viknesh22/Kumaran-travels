import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tripsAPI, expensesAPI } from '../utils/api';
import { calculateRouteSegments } from '../utils/geo';
import MapRoute from './MapRoute';
import { downloadTripReport } from '../utils/exportPdf';
import { FiArrowLeft, FiEdit2, FiTrash2, FiMapPin, FiDollarSign, FiTruck, FiCalendar, FiUsers, FiClock, FiPlus, FiTrendingUp, FiDownload, FiRefreshCw, FiCheckCircle, FiAlertCircle, FiDroplet, FiCheck } from 'react-icons/fi';

export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isOwner, isPartner, isDriver } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showDieselForm, setShowDieselForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ expense_type: 'diesel', amount: '', liters: '', description: '' });
  const [paymentForm, setPaymentForm] = useState({ payer_type: 'customer', amount: '', payment_type: 'balance', description: '' });
  const [dieselForm, setDieselForm] = useState({ liters: '', amount: '' });
  const [exporting, setExporting] = useState(false);
  const [showCompleteTripModal, setShowCompleteTripModal] = useState(false);
  const [completionPaymentStatus, setCompletionPaymentStatus] = useState('collected');
  const [driverCashCollected, setDriverCashCollected] = useState('');
  const [driverStartingCash, setDriverStartingCash] = useState('');
  const [driverTotalSpent, setDriverTotalSpent] = useState('');
  const [pendingAmount, setPendingAmount] = useState('');
  const [collectPendingLoading, setCollectPendingLoading] = useState(false);
  const [collectPendingSuccess, setCollectPendingSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const mapRef = useRef(null);

  useEffect(() => {
    loadTrip();
  }, [id]);

  // Calculate route segment distances from stops
  const routeSegments = useMemo(() => {
    return calculateRouteSegments(trip?.stops);
  }, [trip?.stops]);

  const loadTrip = async () => {
    try {
      const res = await tripsAPI.getById(id);
      setTrip(res.data);
    } catch (err) {
      console.error('Failed to load trip:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this trip permanently?')) return;
    try {
      await tripsAPI.delete(id);
      navigate('/trips');
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleStatusChange = async (newStatus, options = {}) => {
    try {
      const updateData = { status: newStatus };
      
      // When completing trip, save financial data
      if (newStatus === 'completed') {
        if (options.driver_starting_cash !== undefined) updateData.driver_starting_cash = options.driver_starting_cash;
        if (options.driver_cash_collected !== undefined) updateData.driver_cash_collected = options.driver_cash_collected;
        if (options.driver_total_spent !== undefined) updateData.driver_total_spent = options.driver_total_spent;
        
        // If collected by driver, mark as collected. If pending, set pending amount.
        if (options.payment_status === 'collected') {
          updateData.advance_amount = trip.total_rent; // Full amount collected
          updateData.balance_amount = 0;
          updateData.pending_amount = 0;
          
          // Record payment for balance due
          const balanceDue = (trip.total_rent || 0) - (trip.advance_amount || 0);
          if (balanceDue > 0) {
            try {
              await expensesAPI.addPayment(id, {
                payer_type: 'driver',
                amount: balanceDue,
                payment_type: 'balance',
                description: 'Balance collected by driver at trip completion'
              });
            } catch (e) {
              console.error('Failed to record completion payment:', e);
            }
          }
        } else {
          // Pending - set pending amount to balance
          const balanceDue = (trip.total_rent || 0) - (trip.advance_amount || 0);
          updateData.pending_amount = Math.max(0, balanceDue);
        }
      }
      
      await tripsAPI.update(id, updateData);
      setShowCompleteTripModal(false);
      loadTrip();
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const handleCompleteTrip = () => {
    // Pre-populate financial data from trip
    setDriverStartingCash(trip.driver_starting_cash?.toString() || '');
    setDriverCashCollected(trip.driver_cash_collected?.toString() || '');
    setDriverTotalSpent(trip.driver_total_spent?.toString() || '');
    
    const balanceDue = (trip.total_rent || 0) - (trip.advance_amount || 0);
    setPendingAmount(balanceDue > 0 ? balanceDue.toString() : '0');
    setCompletionPaymentStatus('collected');
    setShowCompleteTripModal(true);
  };

  const handleConfirmCompleteTrip = async () => {
    await handleStatusChange('completed', {
      driver_starting_cash: parseFloat(driverStartingCash) || 0,
      driver_cash_collected: parseFloat(driverCashCollected) || 0,
      driver_total_spent: parseFloat(driverTotalSpent) || 0,
      payment_status: completionPaymentStatus,
    });
  };

  const handleCollectPending = async () => {
    if (!window.confirm(`Collect pending amount of ₹${(trip.pending_amount || 0).toLocaleString()}?`)) return;
    setCollectPendingLoading(true);
    try {
      await tripsAPI.collectPendingAmount(id, { amount: trip.pending_amount });
      setCollectPendingSuccess(true);
      loadTrip();
      setTimeout(() => setCollectPendingSuccess(false), 3000);
    } catch (err) {
      console.error('Collect pending failed:', err);
      alert(err.response?.data?.error || 'Failed to collect pending amount');
    } finally {
      setCollectPendingLoading(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      await expensesAPI.add(id, expenseForm);
      setExpenseForm({ expense_type: 'diesel', amount: '', liters: '', description: '' });
      setShowExpenseForm(false);
      loadTrip();
    } catch (err) {
      console.error('Add expense failed:', err);
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    setPaymentError('');
    try {
      await expensesAPI.addPayment(id, paymentForm);
      setPaymentForm({ payer_type: 'customer', amount: '', payment_type: 'balance', description: '' });
      setShowPaymentForm(false);
      loadTrip();
    } catch (err) {
      console.error('Add payment failed:', err);
      setPaymentError(err.response?.data?.error || 'Failed to save payment. Please check the amount and try again.');
    }
  };

  const handleDieselRefill = async (e) => {
    e.preventDefault();
    try {
      await tripsAPI.addDieselRefill(id, dieselForm);
      setDieselForm({ liters: '', amount: '' });
      setShowDieselForm(false);
      loadTrip();
    } catch (err) {
      console.error('Diesel refill failed:', err);
    }
  };

  const handleKmUpdate = async (field, value) => {
    try {
      await tripsAPI.update(id, { [field]: parseInt(value) });
      loadTrip();
    } catch (err) {
      console.error('KM update failed:', err);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await downloadTripReport(trip, mapRef.current);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-gray-900">Trip not found</h2>
        <button onClick={() => navigate('/trips')} className="btn-primary mt-4">Back to Trips</button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'route', label: 'Route & Map' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'payments', label: 'Payments' },
    { id: 'driver', label: 'Driver Log' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/trips')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{trip.title}</h1>
              <span className={`status-badge ${trip.status === 'planned' ? 'status-planned' : trip.status === 'ongoing' ? 'status-ongoing' : trip.status === 'completed' ? 'status-completed' : 'status-cancelled'}`}>
                {trip.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {trip.vehicle_name} ({trip.registration_number})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status actions */}
          {trip.status === 'planned' && (isOwner || isPartner) && (
            <button onClick={() => handleStatusChange('ongoing')} className="btn-success text-sm">
              Start Trip
            </button>
          )}
          {trip.status === 'ongoing' && (isOwner || isPartner || isDriver) && (
            <button onClick={handleCompleteTrip} className="btn-success text-sm">
              Complete Trip
            </button>
          )}
          {(trip.status === 'planned' || trip.status === 'ongoing') && (isOwner || isPartner) && (
            <button onClick={() => handleStatusChange('cancelled')} className="btn-danger text-sm">
              Cancel
            </button>
          )}
          {/* Export PDF */}
          <div className="relative group">
            <button onClick={handleExportPdf} disabled={exporting} className="btn-secondary text-sm">
              {exporting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-1" />
              ) : (
                <FiDownload className="w-4 h-4 mr-1" />
              )}
              {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
            {!exporting && activeTab !== 'route' && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                Switch to <strong>Route & Map</strong> tab to include the route map image in the PDF
              </div>
            )}
          </div>

          {isOwner && (
            <Link to={`/trips/${id}/edit`} className="btn-secondary text-sm">
              <FiEdit2 className="w-4 h-4 mr-1" />
              Edit
            </Link>
          )}
          {isOwner && (
            <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
              <FiTrash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><FiCalendar className="w-3 h-3" /> Dates</p>
          <p className="text-sm font-semibold mt-1">
            {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><FiDollarSign className="w-3 h-3" /> Total Rent</p>
          <p className="text-sm font-semibold mt-1">₹{(trip.total_rent || 0).toLocaleString()}</p>
          {trip.balance_amount > 0 && (
            <p className="text-xs text-orange-600">Balance: ₹{(trip.balance_amount || 0).toLocaleString()}</p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><FiTruck className="w-3 h-3" /> Distance</p>
          <p className="text-sm font-semibold mt-1">{trip.total_distance_km || 0} km</p>
          {trip.mileage > 0 && <p className="text-xs text-gray-500">{trip.mileage.toFixed(1)} km/l</p>}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><FiUsers className="w-3 h-3" /> Team</p>
          <p className="text-sm font-semibold mt-1 truncate">{trip.driver_name || 'No driver'}</p>
          {trip.partner_name && <p className="text-xs text-gray-500">{trip.partner_name}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Trip Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Start Location</span><span className="font-medium">{trip.start_location || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">End Location</span><span className="font-medium">{trip.end_location || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Stops Planned</span><span className="font-medium">{trip.stops?.length || 0}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total Distance</span><span className="font-medium">{trip.total_distance_km || 0} km</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Est. Diesel</span><span className="font-medium">{trip.diesel_required_est || 0} liters</span></div>
                  {trip.estimated_diesel_cost > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Est. Diesel Cost</span><span className="font-medium text-amber-700">₹{trip.estimated_diesel_cost.toLocaleString()}</span></div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Financial Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total Rent</span><span className="font-medium">₹{(trip.total_rent || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Advance Collected</span><span className="font-medium text-green-600">₹{(trip.advance_amount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-700 font-semibold">Balance Due</span><span className={`font-semibold ${trip.balance_amount > 0 ? 'text-orange-600' : 'text-green-600'}`}>₹{(trip.balance_amount || 0).toLocaleString()}</span></div>
                  {trip.estimated_diesel_cost > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Est. Diesel Cost</span><span className="font-medium text-amber-600">₹{trip.estimated_diesel_cost.toLocaleString()}</span></div>
                  )}
                  {trip.dieselRefills?.length > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Actual Diesel Spent</span><span className="font-medium text-blue-600">₹{trip.dieselRefills.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString()}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-gray-500">Total Expenses</span><span className="font-medium text-red-600">₹{((trip.total_expenses || 0)).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Net Profit</span><span className={`font-medium ${(trip.total_rent - trip.total_expenses) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{((trip.total_rent || 0) - (trip.total_expenses || 0)).toLocaleString()}
                  </span></div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FiMapPin className="w-4 h-4 text-red-500" />
                  Stops
                </h3>
                <div className="space-y-3">
                  {trip.stops?.map((stop, i) => {
                    const seg = routeSegments.segments[i - 1];
                    return (
                      <div key={stop.id || i}>
                        <div className="flex items-center gap-3 text-sm">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                            stop.stop_type === 'start' ? 'bg-green-500' : stop.stop_type === 'end' ? 'bg-red-500' : 'bg-blue-500'
                          }`}>
                            {i + 1}
                          </div>
                          <span className="flex-1 truncate">{stop.place_name}</span>
                          <span className="text-xs text-gray-400 capitalize">{stop.stop_type}</span>
                          {seg && (
                            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap ml-2">
                              {seg.distance} km
                            </span>
                          )}
                        </div>
                        {seg && (
                          <div className="ml-8 mt-0.5 text-xs text-gray-400 flex items-center gap-1">
                            <span className="text-gray-300">└─</span>
                            <span>{seg.from}</span>
                            <span className="text-gray-300">→</span>
                            <span className="font-medium text-gray-500">{seg.distance} km</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Route Summary Card */}
              {routeSegments.segments?.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FiMapPin className="w-4 h-4 text-blue-500" />
                    Route Summary
                    <span className="text-xs font-normal text-gray-400 ml-auto">Approx. distances</span>
                  </h3>
                  <div className="space-y-1.5">
                    {routeSegments.segments.map((seg, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 truncate mr-2">
                          {seg.from} → {seg.to}
                        </span>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">{seg.distance} km</span>
                      </div>
                    ))}
                    <div className="border-t border-blue-200 pt-2 mt-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-800">Total</span>
                      <span className="text-base font-bold text-primary-700">{routeSegments.total} km</span>
                    </div>
                  </div>
                  
                  {/* Mileage & Fuel */}
                  {trip.total_distance_km > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Actual Distance:</span>
                          <span className="ml-1.5 font-semibold text-gray-900">{trip.total_distance_km} km</span>
                        </div>
                        {trip.diesel_used_liters > 0 && (
                          <div>
                            <span className="text-gray-500">Diesel Used:</span>
                            <span className="ml-1.5 font-semibold text-amber-700">{trip.diesel_used_liters} L</span>
                          </div>
                        )}
                        {trip.mileage > 0 && (
                          <div>
                            <span className="text-gray-500">Actual Mileage:</span>
                            <span className="ml-1.5 font-semibold text-green-700">{trip.mileage.toFixed(1)} km/l</span>
                          </div>
                        )}
                      </div>
                      {trip.diesel_required_est > 0 && (
                        <div className="text-xs text-gray-400 mt-2 space-y-1">
                          <p>Est. fuel requirement: {trip.diesel_required_est} liters</p>
                          {trip.estimated_diesel_cost > 0 && (
                            <p className="text-amber-600 font-medium">
                              Est. diesel cost: ₹{trip.estimated_diesel_cost.toLocaleString()} {trip.diesel_rate_used ? `(₹${trip.diesel_rate_used}/L)` : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {trip.notes && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
                  <p className="text-sm text-gray-600">{trip.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Route & Map Tab */}
        {activeTab === 'route' && (
          <div className="space-y-4">
            {/* Route Summary */}
            {routeSegments.segments?.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FiMapPin className="w-4 h-4 text-blue-500" />
                      Route Details
                      <span className="text-xs font-normal text-gray-400">(approx. straight-line)</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                      {routeSegments.segments.map((seg, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 truncate mr-2">
                            <span className="font-medium text-gray-800">{seg.from}</span>
                            <span className="text-gray-400 mx-1">→</span>
                            <span className="text-gray-600">{seg.to}</span>
                          </span>
                          <span className="font-semibold text-gray-900 whitespace-nowrap">{seg.distance} km</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-blue-200 pt-3 mt-3 flex items-center gap-6">
                      <div>
                        <span className="text-sm text-gray-500">Total Distance:</span>
                        <span className="ml-2 text-lg font-bold text-primary-700">{routeSegments.total} km</span>
                      </div>
                      {trip.total_distance_km > 0 && trip.total_distance_km !== routeSegments.total && (
                        <div className="text-sm text-gray-400">
                          (Road: {trip.total_distance_km} km)
                        </div>
                      )}
                      {trip.mileage > 0 && (
                        <div className="text-sm text-gray-500">
                          Mileage: <span className="font-semibold text-green-700">{trip.mileage.toFixed(1)} km/l</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Map */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div ref={mapRef} className="h-96 lg:h-[500px]">
                <MapRoute stops={trip.stops?.filter(s => s.latitude && s.longitude) || []} />
              </div>
            </div>
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Trip Expenses</h3>
              <button onClick={() => setShowExpenseForm(!showExpenseForm)} className="btn-primary text-sm">
                <FiPlus className="w-4 h-4 mr-1" />
                Add Expense
              </button>
            </div>

            {showExpenseForm && (
              <form onSubmit={handleAddExpense} className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <select value={expenseForm.expense_type} onChange={(e) => setExpenseForm({ ...expenseForm, expense_type: e.target.value })} className="input-field">
                  <option value="diesel">Diesel</option>
                  <option value="parking">Parking</option>
                  <option value="toll">Toll</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="food">Food</option>
                  <option value="other">Other</option>
                </select>
                <input type="number" placeholder="Amount" required value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="input-field" />
                <input type="number" placeholder="Liters (diesel)" value={expenseForm.liters} onChange={(e) => setExpenseForm({ ...expenseForm, liters: e.target.value })} className="input-field" />
                <input type="text" placeholder="Description" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="input-field" />
                <button type="submit" className="btn-primary">Save</button>
              </form>
            )}

            {/* Diesel Refill */}
            {isDriver && trip.status === 'ongoing' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-blue-800">Diesel Refill</h4>
                  <button onClick={() => setShowDieselForm(!showDieselForm)} className="btn-primary text-sm bg-blue-600 hover:bg-blue-700">
                    <FiPlus className="w-4 h-4 mr-1" />
                    Record Refill
                  </button>
                </div>
                {showDieselForm && (
                  <form onSubmit={handleDieselRefill} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="number" placeholder="Liters" required value={dieselForm.liters} onChange={(e) => setDieselForm({ ...dieselForm, liters: e.target.value })} className="input-field" />
                    <input type="number" placeholder="Amount (₹)" required value={dieselForm.amount} onChange={(e) => setDieselForm({ ...dieselForm, amount: e.target.value })} className="input-field" />
                    <button type="submit" className="btn-success">Record</button>
                  </form>
                )}
              </div>
            )}

            {/* Expense List */}
            {trip.expenses?.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left p-3 font-medium text-gray-600">Type</th>
                      <th className="text-left p-3 font-medium text-gray-600">Description</th>
                      <th className="text-right p-3 font-medium text-gray-600">Liters</th>
                      <th className="text-right p-3 font-medium text-gray-600">Amount</th>
                      <th className="text-right p-3 font-medium text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trip.expenses.map(exp => (
                      <tr key={exp.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3">
                          <span className={`status-badge ${exp.expense_type === 'diesel' ? 'status-ongoing' : exp.expense_type === 'toll' || exp.expense_type === 'parking' ? 'status-planned' : 'status-completed'}`}>
                            {exp.expense_type}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600">{exp.description || '-'}</td>
                        <td className="p-3 text-right">{exp.liters ? `${exp.liters} L` : '-'}</td>
                        <td className="p-3 text-right font-medium">₹{(exp.amount || 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-gray-500">{new Date(exp.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={3} className="p-3 text-right">Total:</td>
                      <td className="p-3 text-right">₹{trip.expenses.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">
                <FiDollarSign className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No expenses recorded yet</p>
              </div>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Payment History</h3>
              <button onClick={() => setShowPaymentForm(!showPaymentForm)} className="btn-primary text-sm">
                <FiPlus className="w-4 h-4 mr-1" />
                Record Payment
              </button>
            </div>

            {showPaymentForm && (
              <form onSubmit={handleAddPayment} className="bg-white rounded-xl border border-gray-200 p-4">
                {paymentError && (
                  <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                    <FiAlertCircle className="w-4 h-4 shrink-0" />
                    {paymentError}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  <select value={paymentForm.payer_type} onChange={(e) => setPaymentForm({ ...paymentForm, payer_type: e.target.value })} className="input-field">
                    <option value="customer">Customer</option>
                    <option value="driver">Driver</option>
                    <option value="partner">Partner</option>
                  </select>
                  <select value={paymentForm.payment_type} onChange={(e) => setPaymentForm({ ...paymentForm, payment_type: e.target.value })} className="input-field">
                    <option value="advance">Advance</option>
                    <option value="balance">Balance</option>
                    <option value="diesel_refill">Diesel Refill</option>
                    <option value="other">Other</option>
                  </select>
                  <input type="number" placeholder="Amount" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="input-field" />
                  <input type="text" placeholder="Description" value={paymentForm.description} onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })} className="input-field" />
                  <button type="submit" className="btn-primary">Save</button>
                </div>
                <div className="mt-3 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  <p><strong>Note:</strong> Customer/Partner payments update the trip balance. Driver payments reduce the driver's starting cash amount.</p>
                </div>
              </form>
            )}

            {trip.payments?.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left p-3 font-medium text-gray-600">Type</th>
                      <th className="text-left p-3 font-medium text-gray-600">Payer</th>
                      <th className="text-left p-3 font-medium text-gray-600">Description</th>
                      <th className="text-right p-3 font-medium text-gray-600">Amount</th>
                      <th className="text-right p-3 font-medium text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trip.payments.map(pay => (
                      <tr key={pay.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3">
                          <span className={`status-badge ${pay.payment_type === 'advance' ? 'status-planned' : pay.payment_type === 'balance' ? 'status-ongoing' : 'status-completed'}`}>
                            {pay.payment_type}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600 capitalize">{pay.payer_type}</td>
                        <td className="p-3 text-gray-600">{pay.description || '-'}</td>
                        <td className="p-3 text-right font-medium text-green-600">₹{(pay.amount || 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-gray-500">{new Date(pay.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={3} className="p-3 text-right">Total Collected:</td>
                      <td className="p-3 text-right text-green-600">₹{trip.payments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">
                <FiTrendingUp className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No payments recorded yet</p>
              </div>
            )}

            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-5 border border-green-100">
              <h4 className="font-semibold text-gray-900 mb-2">Payment Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Total Rent</p>
                  <p className="font-bold text-lg">₹{(trip.total_rent || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Collected</p>
                  <p className="font-bold text-lg text-green-600">₹{(trip.advance_amount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Balance Due</p>
                  <p className={`font-bold text-lg ${trip.balance_amount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    ₹{(trip.balance_amount || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Driver Diesel Paid</p>
                  <p className="font-bold text-lg text-blue-600">
                    ₹{trip.payments?.filter(p => p.payment_type === 'diesel_refill').reduce((s, p) => s + (p.amount || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Driver Log Tab */}
        {activeTab === 'driver' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FiClock className="w-4 h-4 text-primary-500" />
                Kilometer Tracking
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start KM Reading</label>
                  <input
                    type="number"
                    className="input-field"
                    value={trip.start_km_reading || ''}
                    onChange={(e) => handleKmUpdate('start_km_reading', e.target.value)}
                    placeholder="Enter start KM"
                    disabled={!isDriver && !isOwner}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End KM Reading</label>
                  <input
                    type="number"
                    className="input-field"
                    value={trip.end_km_reading || ''}
                    onChange={(e) => handleKmUpdate('end_km_reading', e.target.value)}
                    placeholder="Enter end KM"
                    disabled={!isDriver && !isOwner}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Distance</label>
                  <input
                    type="text"
                    className="input-field bg-gray-50"
                    value={trip.start_km_reading && trip.end_km_reading ? `${(trip.end_km_reading - trip.start_km_reading)} km` : 'N/A'}
                    readOnly
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Diesel & Mileage</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Diesel Used (Liters)</label>
                  <input
                    type="number"
                    className="input-field bg-gray-50"
                    value={trip.diesel_used_liters || ''}
                    readOnly
                    placeholder="Auto-calculated from refills"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Est. Diesel Required</label>
                  <input
                    type="text"
                    className="input-field bg-gray-50"
                    value={trip.diesel_required_est ? `${trip.diesel_required_est} L` : 'N/A'}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mileage</label>
                  <div className="input-field bg-gray-50 flex items-center">
                    <span className={trip.mileage > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                      {trip.mileage > 0 ? `${trip.mileage.toFixed(2)} km/l` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700 font-medium">Estimated Diesel Cost</p>
                  {trip.estimated_diesel_cost > 0 ? (
                    <p className="text-lg font-bold text-amber-800 mt-1">
                      ₹{trip.estimated_diesel_cost.toLocaleString()}
                      {trip.diesel_rate_used && (
                        <span className="text-xs font-normal text-amber-600 ml-1">@{trip.diesel_rate_used}/L</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-500 mt-1">Not calculated</p>
                  )}
                  {trip.diesel_required_est > 0 && trip.estimated_diesel_cost > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {trip.diesel_required_est}L × ₹{trip.diesel_rate_used || 90}/L
                    </p>
                  )}
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700 font-medium">Actual Diesel Spent</p>
                  {trip.dieselRefills?.length > 0 ? (
                    <>
                      <p className="text-lg font-bold text-blue-800 mt-1">
                        ₹{trip.dieselRefills.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        {trip.diesel_used_liters || 0} L total
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-blue-500 mt-1">No refills recorded</p>
                  )}
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-700 font-medium">Avg. Diesel Rate</p>
                  {trip.dieselRefills?.length > 0 ? (
                    <>
                      <p className="text-lg font-bold text-green-800 mt-1">
                        ₹{(trip.dieselRefills.reduce((s, r) => s + (r.amount || 0), 0) / (trip.diesel_used_liters || 1)).toFixed(2)}/L
                      </p>
                      <p className="text-xs text-green-600 mt-0.5">
                        {trip.dieselRefills.length} refill{trip.dieselRefills.length > 1 ? 's' : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-green-500 mt-1">N/A</p>
                  )}
                </div>
              </div>
            </div>

            {/* Driver Financial Tracking */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FiDollarSign className="w-4 h-4 text-green-500" />
                Driver Trip Financials
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cash Driver Started With (₹)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={trip.driver_starting_cash || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      tripsAPI.update(id, { driver_starting_cash: parseFloat(val) || 0 })
                        .then(() => loadTrip())
                        .catch(err => console.error('Update failed:', err));
                    }}
                    placeholder="0"
                    min="0"
                    disabled={trip.status === 'completed'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cash Collected from Passengers (₹)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={trip.driver_cash_collected || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      tripsAPI.update(id, { driver_cash_collected: parseFloat(val) || 0 })
                        .then(() => loadTrip())
                        .catch(err => console.error('Update failed:', err));
                    }}
                    placeholder="0"
                    min="0"
                    disabled={trip.status === 'completed'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Spent by Driver (₹)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={trip.driver_total_spent || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      tripsAPI.update(id, { driver_total_spent: parseFloat(val) || 0 })
                        .then(() => loadTrip())
                        .catch(err => console.error('Update failed:', err));
                    }}
                    placeholder="0"
                    min="0"
                    disabled={trip.status === 'completed'}
                  />
                </div>
              </div>
              
              {/* Driver Cash Summary */}
              <div className="mt-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-blue-100 p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Cash Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Starting Cash</p>
                    <p className="font-semibold text-gray-900">₹{(trip.driver_starting_cash || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">+ Collected</p>
                    <p className="font-semibold text-green-600">₹{(trip.driver_cash_collected || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">- Spent</p>
                    <p className="font-semibold text-red-600">₹{(trip.driver_total_spent || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white/60 rounded-lg p-2">
                    <p className="text-xs text-gray-500">Net Cash</p>
                    <p className={`font-bold ${((trip.driver_starting_cash || 0) + (trip.driver_cash_collected || 0) - (trip.driver_total_spent || 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      ₹{((trip.driver_starting_cash || 0) + (trip.driver_cash_collected || 0) - (trip.driver_total_spent || 0)).toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Net Cash = Starting Cash + Collected - Spent. This shows how much cash the driver should have after the trip.
                </p>
              </div>
            </div>

            {/* Diesel Refill History */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Diesel Refill History</h3>
              {trip.dieselRefills?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 text-gray-500 font-medium">Liters</th>
                        <th className="text-right py-2 px-2 text-gray-500 font-medium">Amount</th>
                        <th className="text-right py-2 px-2 text-gray-500 font-medium">Rate/L</th>
                        <th className="text-left py-2 px-2 text-gray-500 font-medium">Filled By</th>
                        <th className="text-right py-2 px-2 text-gray-500 font-medium">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trip.dieselRefills.map(refill => (
                        <tr key={refill.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2.5 px-2 font-medium">{refill.liters} L</td>
                          <td className="py-2.5 px-2 text-right">₹{(refill.amount || 0).toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right text-gray-500">
                            {refill.rate_per_liter ? `₹${refill.rate_per_liter}/L` : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600">{refill.filled_by_name || 'Driver'}</td>
                          <td className="py-2.5 px-2 text-right text-gray-400 text-xs">
                            {new Date(refill.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="py-2.5 px-2">{trip.diesel_used_liters || 0} L total</td>
                        <td className="py-2.5 px-2 text-right">₹{trip.dieselRefills.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString()}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <FiDroplet className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No diesel refills recorded</p>
                  <p className="text-xs mt-1">Use the Expenses tab to record diesel refills during the trip</p>
                </div>
              )}
            </div>

            {/* Pending Amount Section */}
            {trip.pending_amount > 0 && trip.status === 'completed' && isOwner && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-orange-800 flex items-center gap-2">
                      <FiAlertCircle className="w-4 h-4" />
                      Pending Collection
                    </h3>
                    <p className="text-sm text-orange-700 mt-1">
                      This trip has a pending amount of <strong>₹{trip.pending_amount.toLocaleString()}</strong> 
                      that needs to be collected from the customer.
                    </p>
                    {trip.pending_amount_collected > 0 && (
                      <p className="text-sm text-green-700 mt-1">
                        ✅ Previously collected: ₹{trip.pending_amount_collected.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleCollectPending}
                    disabled={collectPendingLoading}
                    className="btn-primary bg-orange-600 hover:bg-orange-700 text-sm whitespace-nowrap"
                  >
                    {collectPendingLoading ? (
                      <span className="flex items-center gap-1">
                        <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <FiCheck className="w-3.5 h-3.5" />
                        Collect ₹{trip.pending_amount.toLocaleString()}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Completed status info */}
            {trip.status === 'completed' && trip.pending_amount <= 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4" />
                  <strong>All payments collected.</strong> No pending amount for this trip.
                </p>
              </div>
            )}

            {isDriver && trip.status === 'ongoing' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm text-yellow-700">
                  <strong>Driver Instructions:</strong> Enter the start kilometer reading before beginning the trip.
                  Record all diesel refills with receipts. At the end of the trip, enter the end kilometer reading
                  and record how much cash you collected from passengers.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Trip Completion Modal */}
      {showCompleteTripModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl animate-fadeIn max-h-[85vh]">
            <div className="p-6 overflow-y-auto max-h-[85vh]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <FiCheck className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Complete Trip</h2>
                  <p className="text-sm text-gray-500">Review financials before completing "{trip.title}"</p>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Rent</span>
                  <span className="font-semibold">₹{(trip.total_rent || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Advance Already Collected</span>
                  <span className="font-semibold text-green-600">₹{(trip.advance_amount || 0).toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-medium text-gray-700">Balance Due</span>
                  <span className={`font-bold text-lg ${(trip.total_rent - trip.advance_amount) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    ₹{Math.max(0, (trip.total_rent || 0) - (trip.advance_amount || 0)).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Driver Financial Fields */}
              <div className="space-y-4 mb-5">
                <h3 className="font-semibold text-gray-900 text-sm">Driver Trip Financials</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cash Driver Started With (₹)</label>
                    <input
                      type="number"
                      value={driverStartingCash}
                      onChange={e => setDriverStartingCash(e.target.value)}
                      className="input-field"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cash Collected from Passengers (₹)</label>
                    <input
                      type="number"
                      value={driverCashCollected}
                      onChange={e => setDriverCashCollected(e.target.value)}
                      className="input-field"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Total Spent by Driver (₹)</label>
                    <input
                      type="number"
                      value={driverTotalSpent}
                      onChange={e => setDriverTotalSpent(e.target.value)}
                      className="input-field"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700">Net Cash with Driver</span>
                    <span className={`font-bold text-sm ${(parseFloat(driverCashCollected || 0) + parseFloat(driverStartingCash || 0) - parseFloat(driverTotalSpent || 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₹{(parseFloat(driverCashCollected || 0) + parseFloat(driverStartingCash || 0) - parseFloat(driverTotalSpent || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Status */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Has the remaining balance been collected?
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCompletionPaymentStatus('collected')}
                    className={`flex-1 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      completionPaymentStatus === 'collected'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <FiCheck className="w-4 h-4 mx-auto mb-1" />
                    Collected by Driver
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletionPaymentStatus('pending')}
                    className={`flex-1 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      completionPaymentStatus === 'pending'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <FiAlertCircle className="w-4 h-4 mx-auto mb-1" />
                    Pending - Owner to Collect
                  </button>
                </div>
                {completionPaymentStatus === 'pending' && (
                  <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                    <FiAlertCircle className="w-3 h-3 inline mr-1" />
                    The pending amount of <strong>₹{Math.max(0, (trip.total_rent || 0) - (trip.advance_amount || 0)).toLocaleString()}</strong> will be marked for owner collection.
                    You can collect it later from the trip details.
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button
                  onClick={handleConfirmCompleteTrip}
                  className="btn-success flex-1"
                >
                  <FiCheck className="w-4 h-4 mr-1.5" />
                  Confirm Complete Trip
                </button>
                <button
                  onClick={() => setShowCompleteTripModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Amount Collection Success Toast */}
      {collectPendingSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-fadeIn">
          <FiCheck className="w-4 h-4" />
          Pending amount collected successfully!
        </div>
      )}
    </div>
  );
}
