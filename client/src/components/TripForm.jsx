import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tripsAPI, vehiclesAPI, authAPI, settingsAPI } from '../utils/api';
import { calculateRouteSegments } from '../utils/geo';
import { searchNominatim, reverseGeocode } from '../utils/geolocation';
import MapRoute from './MapRoute';
import { FiPlus, FiTrash2, FiSave, FiArrowLeft, FiMapPin, FiCalendar, FiDollarSign, FiTruck, FiUsers, FiAlertCircle, FiCheck, FiSearch, FiNavigation, FiX } from 'react-icons/fi';

const DEFAULT_STOPS = [
  { place_name: '', latitude: null, longitude: null, stop_order: 0, stop_type: 'start' },
];

export default function TripForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user, isOwner, isPartner } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [availability, setAvailability] = useState({ available: true, conflicts: [] });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [bookedDates, setBookedDates] = useState([]);
  const [loadingBookedDates, setLoadingBookedDates] = useState(false);
  const [bookedVehicleIds, setBookedVehicleIds] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const [geocodingLoad, setGeocodingLoad] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(null);
  const [geolocatingIndex, setGeolocatingIndex] = useState(null);
  const [geoError, setGeoError] = useState('');
  const geocodeTimers = useRef({});
  const suggestionClickedRef = useRef({});
  const stopContainerRefs = useRef({});
  const suggestionsRef = useRef(suggestions);
  useEffect(() => { suggestionsRef.current = suggestions; }, [suggestions]);

  const [formData, setFormData] = useState({
    title: '',
    vehicle_id: '',
    driver_id: '',
    partner_id: '',
    start_date: '',
    end_date: '',
    total_rent: '',
    advance_amount: '',
    start_location: '',
    end_location: '',
    notes: '',
    stops: [{ ...DEFAULT_STOPS[0] }],
  });

  const stopsRef = useRef(formData.stops);
  // Keep stopsRef in sync with latest stops
  useEffect(() => { stopsRef.current = formData.stops; }, [formData.stops]);

  const [vehicleMileage, setVehicleMileage] = useState(0);
  const [tripMileageOverride, setTripMileageOverride] = useState('');
  const [segmentDistances, setSegmentDistances] = useState([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [dieselRate, setDieselRate] = useState(90);

  useEffect(() => {
    loadVehicles();
    loadUsers();
    loadDieselRate();
    if (isEdit) loadTrip();
  }, [id]);

  // Fetch booked dates for the selected vehicle/driver to show blocked date ranges
  useEffect(() => {
    if (formData.vehicle_id) {
      fetchBookedDates();
    } else {
      setBookedDates([]);
    }
  }, [formData.vehicle_id, formData.driver_id]);

  // Fetch vehicle availability summary when dates change (for dropdown indicator)
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      fetchVehicleAvailability();
    } else {
      setBookedVehicleIds([]);
    }
  }, [formData.start_date, formData.end_date]);

  // Check availability whenever vehicle, driver, or dates change
  useEffect(() => {
    if (formData.vehicle_id && formData.start_date && formData.end_date) {
      checkAvailability();
    }
  }, [formData.vehicle_id, formData.driver_id, formData.start_date, formData.end_date]);

  const loadVehicles = async () => {
    try {
      const res = await vehiclesAPI.getAll();
      setVehicles(res.data);
    } catch (err) {
      console.error('Failed to load vehicles:', err);
    }
  };

  const loadUsers = async () => {
    try {
      setUsersError('');
      const res = await authAPI.getUsers();
      setUsers(res.data);
    } catch (err) {
      setUsersError('Failed to load users list. Please refresh the page.');
      console.error('Failed to load users:', err);
    }
  };

  const loadTrip = async () => {
    try {
      setLoading(true);
      const res = await tripsAPI.getById(id);
      const trip = res.data;
      setFormData({
        title: trip.title || '',
        vehicle_id: trip.vehicle_id?.toString() || '',
        driver_id: trip.driver_id?.toString() || '',
        partner_id: trip.partner_id?.toString() || '',
        start_date: trip.start_date || '',
        end_date: trip.end_date || '',
        total_rent: trip.total_rent?.toString() || '',
        advance_amount: trip.advance_amount?.toString() || '',
        start_location: trip.start_location || '',
        end_location: trip.end_location || '',
        notes: trip.notes || '',
        stops: trip.stops?.length > 0 ? trip.stops.map((s, i) => ({
          place_name: s.place_name,
          latitude: s.latitude,
          longitude: s.longitude,
          stop_order: i,
          stop_type: s.stop_type || (i === 0 ? 'start' : i === trip.stops.length - 1 ? 'end' : 'stop'),
          is_return_trip: s.is_return_trip || 0,
        })) : [{ ...DEFAULT_STOPS[0] }],
      });
      if (trip.stops?.length > 0) setShowMap(true);
    } catch (err) {
      setError('Failed to load trip');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDieselRate = async () => {
    try {
      const res = await settingsAPI.getPublic();
      if (res.data?.diesel_rate) {
        setDieselRate(res.data.diesel_rate);
      }
    } catch (err) {
      console.error('Failed to load diesel rate:', err);
      // Fall back to default 90
    }
  };

  const fetchBookedDates = useCallback(async () => {
    if (!formData.vehicle_id) return;
    setLoadingBookedDates(true);
    try {
      const params = { vehicle_id: formData.vehicle_id };
      if (formData.driver_id) params.driver_id = formData.driver_id;
      const res = await tripsAPI.getBookedDates(params);
      setBookedDates(res.data || []);
    } catch (err) {
      console.error('Failed to fetch booked dates:', err);
    } finally {
      setLoadingBookedDates(false);
    }
  }, [formData.vehicle_id, formData.driver_id]);

  const fetchVehicleAvailability = useCallback(async () => {
    if (!formData.start_date || !formData.end_date) return;
    try {
      const params = {
        start_date: formData.start_date,
        end_date: formData.end_date,
      };
      if (isEdit) params.exclude_trip_id = id;
      const res = await tripsAPI.getVehicleAvailability(params);
      setBookedVehicleIds(res.data?.booked_vehicle_ids || []);
    } catch (err) {
      console.error('Failed to fetch vehicle availability:', err);
      setBookedVehicleIds([]);
    }
  }, [formData.start_date, formData.end_date, isEdit, id]);

  const checkAvailability = useCallback(async () => {
    if (!formData.vehicle_id || !formData.start_date || !formData.end_date) return;
    setCheckingAvailability(true);
    try {
      const params = {
        vehicle_id: formData.vehicle_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
      };
      if (formData.driver_id) params.driver_id = formData.driver_id;
      if (isEdit) params.exclude_trip_id = id;
      const res = await tripsAPI.checkAvailability(params);
      setAvailability(res.data);
    } catch (err) {
      console.error('Availability check failed:', err);
    } finally {
      setCheckingAvailability(false);
    }
  }, [formData.vehicle_id, formData.driver_id, formData.start_date, formData.end_date, isEdit, id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStopChange = (index, field, value) => {
    const newStops = [...formData.stops];
    newStops[index] = { ...newStops[index], [field]: value };
    setFormData(prev => ({ ...prev, stops: newStops }));
  };

  const updateStopFields = (index, fields) => {
    const newStops = formData.stops.map((stop, i) =>
      i === index ? { ...stop, ...fields } : stop
    );
    setFormData(prev => ({ ...prev, stops: newStops }));
  };

  // Geocode a place name via Nominatim (cached in localStorage)
  const geocodePlace = useCallback(async (index, query) => {
    if (!query.trim()) {
      setSuggestions(prev => ({ ...prev, [index]: [] }));
      return;
    }

    setGeocodingLoad(prev => ({ ...prev, [index]: true }));

    try {
      const data = await searchNominatim(query);
      setSuggestions(prev => ({ ...prev, [index]: data || [] }));
    } catch (err) {
      console.error('Geocoding failed:', err);
      setSuggestions(prev => ({ ...prev, [index]: [] }));
    } finally {
      setGeocodingLoad(prev => ({ ...prev, [index]: false }));
    }
  }, []);

  // Handle stop input change with debounced geocoding
  const handleStopInputChange = (index, value) => {
    // Clear geo errors when user starts typing
    if (geoError) setGeoError('');
    // Batch all field updates atomically to avoid stale closure issues
    updateStopFields(index, { place_name: value, latitude: null, longitude: null });

    if (geocodeTimers.current[index]) {
      clearTimeout(geocodeTimers.current[index]);
    }

    if (value.trim()) {
      geocodeTimers.current[index] = setTimeout(() => {
        geocodePlace(index, value);
      }, 600);
    } else {
      setSuggestions(prev => ({ ...prev, [index]: [] }));
    }
  };

  // Handle keyboard navigation in suggestions
  const handleStopKeyDown = (index, e) => {
    const stopSuggestions = suggestions[index] || [];

    if (e.key === 'Enter') {
      e.preventDefault();
      if (geocodeTimers.current[index]) {
        clearTimeout(geocodeTimers.current[index]);
      }
      if (stopSuggestions.length > 0) {
        if (activeSuggestionIdx !== null && stopSuggestions[activeSuggestionIdx]) {
          selectSuggestion(index, stopSuggestions[activeSuggestionIdx]);
        } else {
          selectSuggestion(index, stopSuggestions[0]);
        }
      } else {
        // Direct geocode without suggestions
        geocodePlace(index, formData.stops[index]?.place_name || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIdx(prev =>
        prev === null ? 0 : Math.min(prev + 1, stopSuggestions.length - 1)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIdx(prev =>
        prev === null || prev <= 0 ? null : prev - 1
      );
    } else if (e.key === 'Escape') {
      setSuggestions(prev => ({ ...prev, [index]: [] }));
      setActiveSuggestionIdx(null);
    }
  };

  // Select a suggestion from the dropdown
  const selectSuggestion = (index, suggestion) => {
    updateStopFields(index, {
      place_name: suggestion.display_name.split(',')[0],
      latitude: parseFloat(suggestion.lat),
      longitude: parseFloat(suggestion.lon),
    });
    setSuggestions(prev => ({ ...prev, [index]: [] }));
    setActiveSuggestionIdx(null);
  };

  // Use the browser's geolocation to set the current position for a stop
  const handleUseCurrentLocation = async (index) => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser');
      return;
    }

    setGeolocatingIndex(index);
    setGeoError('');
    setSuggestions(prev => ({ ...prev, [index]: [] }));

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const { latitude, longitude } = position.coords;

      // Reverse geocode to get a place name (cached in localStorage)
      const geoResult = await reverseGeocode(latitude, longitude);
      const suggestion = {
        display_name: geoResult.display_name,
        lat: geoResult.lat,
        lon: geoResult.lon,
      };
      selectSuggestion(index, suggestion);
    } catch (err) {
      console.error('Geolocation failed:', err);
      setGeoError(err.code === 1 ? 'Location access denied. Please check your browser permissions.' : 'Could not get current location. Please try typing the location name.');
    } finally {
      setGeolocatingIndex(null);
    }
  };

  // Dismiss suggestions when clicking outside the stop input container
  useEffect(() => {
    const handleClickOutside = (e) => {
      const currentSuggestions = suggestionsRef.current;
      Object.keys(currentSuggestions).forEach((indexStr) => {
        const index = parseInt(indexStr);
        const stopSuggestions = currentSuggestions[index];
        if (stopSuggestions && stopSuggestions.length > 0) {
          const container = stopContainerRefs.current[index];
          if (container && !container.contains(e.target)) {
            setSuggestions(prev => ({ ...prev, [index]: [] }));
            setActiveSuggestionIdx(null);
          }
        }
      });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean up geocode timers on unmount
  useEffect(() => {
    return () => {
      Object.values(geocodeTimers.current).forEach(t => clearTimeout(t));
    };
  }, []);

  // Calculate segment distances whenever stops change
  useEffect(() => {
    const result = calculateRouteSegments(formData.stops);
    setSegmentDistances(result.segments);
    setTotalDistance(result.total);
  }, [formData.stops]);

  // When vehicle is selected, get its mileage
  const prevVehicleIdRef = useRef(formData.vehicle_id);
  useEffect(() => {
    const vehicle = vehicles.find(v => v.id === parseInt(formData.vehicle_id));
    if (vehicle) {
      setVehicleMileage(vehicle.mileage_kmpl || 0);
      // Auto-populate mileage only when vehicle changes, or if not yet set
      const vehicleChanged = prevVehicleIdRef.current !== formData.vehicle_id;
      if (vehicleChanged && vehicle.mileage_kmpl) {
        setTripMileageOverride(vehicle.mileage_kmpl.toString());
      } else if (!tripMileageOverride && vehicle.mileage_kmpl) {
        setTripMileageOverride(vehicle.mileage_kmpl.toString());
      }
      prevVehicleIdRef.current = formData.vehicle_id;
    } else {
      setVehicleMileage(0);
    }
  }, [formData.vehicle_id, vehicles]);

  const effectiveMileage = parseFloat(tripMileageOverride) || vehicleMileage || 0;
  const estimatedDiesel = effectiveMileage > 0 && totalDistance > 0
    ? parseFloat((totalDistance / effectiveMileage).toFixed(1))
    : 0;

  const addStop = () => {
    setFormData(prev => ({
      ...prev,
      stops: [...prev.stops, { place_name: '', latitude: null, longitude: null, stop_order: prev.stops.length, stop_type: 'stop' }],
    }));
  };

  const removeStop = (index) => {
    if (formData.stops.length <= 1) return;
    const newStops = formData.stops.filter((_, i) => i !== index).map((s, i) => ({ ...s, stop_order: i }));
    setFormData(prev => ({ ...prev, stops: newStops }));
  };

  const handleRouteFound = (routeData) => {
    // OSRM segment distances are haversine-based (same as our calculation),
    // so we only use the OSRM total road distance if segments are consistent
    if (routeData?.totalDistance > 0) {
      // Use OSRM's road distance for a more accurate total
      setTotalDistance(routeData.totalDistance);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const baseData = {
        ...formData,
        vehicle_id: parseInt(formData.vehicle_id),
        driver_id: formData.driver_id ? parseInt(formData.driver_id) : null,
        partner_id: formData.partner_id ? parseInt(formData.partner_id) : null,
        total_rent: parseFloat(formData.total_rent) || 0,
        advance_amount: parseFloat(formData.advance_amount) || 0,
        total_distance_km: parseFloat(totalDistance.toFixed(1)) || 0,
        diesel_required_est: estimatedDiesel,
        diesel_rate_used: dieselRate,
        stops: formData.stops.filter(s => s.place_name.trim()).map((s, i) => ({
          ...s,
          stop_order: i,
          stop_type: i === 0 ? 'start' : i === formData.stops.filter(st => st.place_name.trim()).length - 1 ? 'end' : 'stop',
        })),
      };

      if (isEdit) {
        // On update, server computes mileage from odometer/diesel. Don't send it.
        await tripsAPI.update(id, baseData);
        await tripsAPI.updateStops(id, { stops: baseData.stops });
      } else {
        // On create, store the expected mileage for fuel estimation
        const res = await tripsAPI.create({ ...baseData, mileage: effectiveMileage || 0 });
        // Add stops after creation
        if (baseData.stops.length > 0) {
          await tripsAPI.updateStops(res.data.id, { stops: baseData.stops });
        }
      }

      navigate(isEdit ? `/trips/${id}` : '/trips');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save trip');
    } finally {
      setSaving(false);
    }
  };

  const handlePlaceSelect = async (index, placeName) => {
    // Try to geocode the place using Nominatim (cached)
    try {
      const data = await searchNominatim(placeName, { limit: 1 });
      if (data.length > 0) {
        handleStopChange(index, 'latitude', parseFloat(data[0].lat));
        handleStopChange(index, 'longitude', parseFloat(data[0].lon));
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isOwner && !isPartner) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
        You don't have permission to create or edit trips.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Trip' : 'Create New Trip'}</h1>
          <p className="text-sm text-gray-500 mt-1">{isEdit ? 'Update trip details' : 'Plan a new journey with stops and route'}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!availability.available && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 space-y-2">
          {availability.conflicts?.filter(c => c.conflict_type === 'vehicle').length > 0 && (
            <div className="flex items-start gap-2">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Vehicle is already booked for these dates!</span>
                {availability.conflicts.filter(c => c.conflict_type === 'vehicle').map(c => (
                  <div key={c.id} className="ml-1 text-red-600">• {c.title} {c.driver_name ? `(Driver: ${c.driver_name})` : ''}</div>
                ))}
              </div>
            </div>
          )}
          {availability.conflicts?.filter(c => c.conflict_type === 'driver').length > 0 && (
            <div className="flex items-start gap-2">
              <FiUsers className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Driver is already assigned to another trip for these dates!</span>
                {availability.conflicts.filter(c => c.conflict_type === 'driver').map(c => (
                  <div key={c.id} className="ml-1 text-red-600">• {c.title} ({c.vehicle_name})</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {usersError && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
            {usersError}
          </div>
        )}

        {/* Basic Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FiCalendar className="w-4 h-4 text-primary-500" />
            Trip Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Trip Title *</label>
              <input
                type="text"
                name="title"
                required
                value={formData.title}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g., Trichy to Kanyakumari Pilgrimage"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle *</label>
              <select name="vehicle_id" required value={formData.vehicle_id} onChange={handleChange} className={`input-field ${bookedVehicleIds.length > 0 && formData.vehicle_id && bookedVehicleIds.includes(parseInt(formData.vehicle_id)) ? 'border-red-300 bg-red-50' : ''}`}>
                <option value="">Select vehicle</option>
                {vehicles.map(v => {
                  const isBooked = formData.start_date && formData.end_date && bookedVehicleIds.includes(v.id);
                  return (
                    <option key={v.id} value={v.id}>
                      {v.vehicle_name} ({v.registration_number}){isBooked ? ' 🔴 Booked' : ''}
                    </option>
                  );
                })}
              </select>
              {bookedVehicleIds.length > 0 && formData.start_date && formData.end_date && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
                  <FiAlertCircle className="w-3 h-3 text-amber-500" />
                  <span>{bookedVehicleIds.length} vehicle{bookedVehicleIds.length > 1 ? 's are' : ' is'} already booked for these dates</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
              <select name="driver_id" value={formData.driver_id} onChange={handleChange} className="input-field">
                <option value="">Select driver</option>
                {users.filter(u => u.role === 'driver').map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Partner</label>
              <select name="partner_id" value={formData.partner_id} onChange={handleChange} className="input-field">
                <option value="">Select partner</option>
                {users.filter(u => u.role === 'partner').map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Location</label>
              <input
                type="text"
                name="start_location"
                value={formData.start_location}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g., Trichy"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Location</label>
              <input
                type="text"
                name="end_location"
                value={formData.end_location}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g., Srirangam"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                name="start_date"
                required
                value={formData.start_date}
                onChange={handleChange}
                className={`input-field ${!availability.available ? 'border-red-300 bg-red-50' : ''}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
              <input
                type="date"
                name="end_date"
                required
                value={formData.end_date}
                onChange={handleChange}
                className={`input-field ${!availability.available ? 'border-red-300 bg-red-50' : ''}`}
              />
            </div>
          </div>

          {/* Blocked Dates Visual Widget */}
          {bookedDates.length > 0 && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <FiAlertCircle className="w-3.5 h-3.5" />
                  Blocked Dates{loadingBookedDates ? ' (loading...)' : ''}
                </h3>
                <span className="text-[10px] text-amber-600">{bookedDates.length} existing booking{bookedDates.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-1">
                {bookedDates.map(b => (
                  <div key={b.id} className="flex items-center gap-2 text-xs text-amber-700 bg-white/60 rounded px-2 py-1">
                    <FiCalendar className="w-3 h-3 shrink-0 text-amber-500" />
                    <span className="font-medium truncate">{b.title}</span>
                    <span className="text-amber-500 mx-1">—</span>
                    <span className="whitespace-nowrap">
                      {new Date(b.start_date).toLocaleDateString()} - {new Date(b.end_date).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-auto whitespace-nowrap">
                      {b.vehicle_name}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-amber-600 mt-2">This vehicle{formData.driver_id ? ' / driver' : ''} is unavailable on the dates above. Please choose different dates or select another vehicle.</p>
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FiDollarSign className="w-4 h-4 text-green-500" />
            Pricing & Payment
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Rent (₹)</label>
              <input
                type="number"
                name="total_rent"
                value={formData.total_rent}
                onChange={handleChange}
                className="input-field"
                placeholder="35000"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Advance Amount (₹)</label>
              <input
                type="number"
                name="advance_amount"
                value={formData.advance_amount}
                onChange={handleChange}
                className="input-field"
                placeholder="15000"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Balance (auto-calc)</label>
              <input
                type="text"
                className="input-field bg-gray-50"
                value={formData.total_rent && formData.advance_amount ? `₹${(parseFloat(formData.total_rent) - parseFloat(formData.advance_amount)).toLocaleString()}` : '₹0'}
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Trip Stops with Map */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FiMapPin className="w-4 h-4 text-red-500" />
              Trip Stops & Route
            </h2>
            <button type="button" onClick={() => setShowMap(!showMap)} className="btn-secondary text-sm">
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>
          </div>

          {showMap && (
            <div className="mb-4 h-80 lg:h-96 rounded-lg overflow-hidden border border-gray-200">
              <MapRoute
                stops={formData.stops.filter(s => s.place_name)}
                onRouteFound={handleRouteFound}
              />
            </div>
          )}              <div className="space-y-3 relative">
                {formData.stops.map((stop, index) => {
                  const isLoading = geocodingLoad[index];
                  const hasCoords = stop.latitude != null && stop.longitude != null;
                  const stopSuggestions = suggestions[index] || [];
                  const showSuggestions = stopSuggestions.length > 0 && !hasCoords;

                  return (
                    <div key={index} className="relative">
                      <div className="grid grid-cols-[auto_4fr_minmax(80px,1fr)_auto] gap-2 items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                          stop.stop_type === 'start' ? 'bg-green-500' :
                          stop.stop_type === 'end' ? 'bg-red-500' :
                          'bg-primary-500'
                        }`}>
                          {index + 1}
                        </div>

                        <div className="relative" ref={el => { stopContainerRefs.current[index] = el; }}>
                          <input
                            type="text"
                            value={stop.place_name}
                            onChange={(e) => handleStopInputChange(index, e.target.value)}
                            onKeyDown={(e) => handleStopKeyDown(index, e)}
                            onBlur={() => {
                              // Delay hiding suggestions so click can register
                              setTimeout(() => {
                                // Cancel any pending debounced geocode to avoid duplicate requests
                                if (geocodeTimers.current[index]) {
                                  clearTimeout(geocodeTimers.current[index]);
                                }
                                // If a suggestion was clicked, skip auto-geocode
                                if (suggestionClickedRef.current[index]) {
                                  suggestionClickedRef.current[index] = false;
                                  setSuggestions(prev => ({ ...prev, [index]: [] }));
                                  setActiveSuggestionIdx(null);
                                  return;
                                }

                                // Auto-geocode on blur: if place name entered but no coordinates selected
                                const stop = stopsRef.current[index];
                                if (stop?.place_name.trim() && stop.latitude == null) {
                                  const stopSuggestions = suggestions[index] || [];
                                  if (stopSuggestions.length > 0) {
                                    selectSuggestion(index, stopSuggestions[0]);
                                  } else {
                                    // Geocode directly without waiting for suggestions debounce
                                    setGeocodingLoad(prev => ({ ...prev, [index]: true }));
                                    searchNominatim(stop.place_name, { limit: 1 })
                                      .then(data => {
                                        if (data.length > 0) {
                                          selectSuggestion(index, data[0]);
                                        }
                                      })
                                      .catch(err => console.error('Auto-geocode on blur failed:', err))
                                      .finally(() => {
                                        setGeocodingLoad(prev => ({ ...prev, [index]: false }));
                                      });
                                  }
                                }

                                setSuggestions(prev => ({ ...prev, [index]: [] }));
                                setActiveSuggestionIdx(null);
                              }, 200);
                            }}
                            onFocus={() => {
                              // Re-show suggestions if not already geocoded and no cached results
                              const cached = suggestions[index];
                              if (!hasCoords && stop.place_name.trim() && (!cached || cached.length === 0)) {
                                geocodePlace(index, stop.place_name);
                              }
                            }}
                            className={`input-field w-full pr-9 ${
                              hasCoords ? 'border-green-300 bg-green-50' :
                              isLoading ? 'border-blue-300' : ''
                            }`}
                            placeholder={index === 0 ? 'Start location (e.g. Trichy, Salem)' : index === formData.stops.length - 1 ? 'End/drop location' : `Stop ${index + 1}`}
                          />

                          {/* Status indicator */}
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            {isLoading ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
                            ) : hasCoords ? (
                              <FiCheck className="w-4 h-4 text-green-500" />
                            ) : stop.place_name.trim() ? (
                              <FiSearch className="w-4 h-4 text-gray-300" />
                            ) : null}
                          </div>

                          {/* Suggestions dropdown */}
                          {(showSuggestions || (stop.place_name.trim() && !hasCoords)) && (
                            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {/* Nominatim suggestions */}
                              {stopSuggestions.map((s, i) => {
                                const parts = s.display_name.split(',').map(p => p.trim());
                                const mainName = parts[0];
                                const regionParts = parts.slice(1, -1); // Exclude country
                                return (
                                  <button
                                    key={s.osm_id || i}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      suggestionClickedRef.current[index] = true;
                                      selectSuggestion(index, s);
                                    }}
                                    onMouseEnter={() => setActiveSuggestionIdx(i)}
                                    className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors ${
                                      activeSuggestionIdx === i
                                        ? 'bg-primary-50 text-primary-700'
                                        : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    <FiMapPin className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                                      activeSuggestionIdx === i ? 'text-primary-500' : 'text-gray-400'
                                    }`} />
                                    <div className="min-w-0">
                                      <span className="block truncate font-medium text-gray-900">
                                        {mainName}
                                      </span>
                                      <span className="block truncate text-xs text-gray-400 mt-0.5">
                                        {regionParts.join(', ')}
                                      </span>
                                    </div>
                                    <span className="ml-auto text-[10px] text-gray-300 font-mono self-center shrink-0">
                                      {parseFloat(s.lat).toFixed(2)}, {parseFloat(s.lon).toFixed(2)}
                                    </span>
                                  </button>
                                );
                              })}

                              {/* Divider between suggestions and current location */}
                              {stopSuggestions.length > 0 && (
                                <div className="border-t border-gray-100" />
                              )}

                              {/* Use current location option */}
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  suggestionClickedRef.current[index] = true;
                                  handleUseCurrentLocation(index);
                                }}
                                onMouseEnter={() => setActiveSuggestionIdx(null)}
                                disabled={geolocatingIndex === index}
                                className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                                  geolocatingIndex === index
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
                                }`}
                              >
                                {geolocatingIndex === index ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent shrink-0" />
                                    <span className="font-medium">Getting your location...</span>
                                  </>
                                ) : (
                                  <>
                                    <FiNavigation className="w-3.5 h-3.5 shrink-0" />
                                    <span className="font-medium">Use current location</span>
                                  </>
                                )}
                              </button>

                              {/* Geo error message */}
                              {geoError && (
                                <div className="px-3 py-2 text-xs text-red-500 bg-red-50 border-t border-red-100">
                                  {geoError}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <select
                          value={stop.stop_type}
                          onChange={(e) => handleStopChange(index, 'stop_type', e.target.value)}
                          className={`w-24 text-xs px-2 py-1.5 border rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ${
                            stop.stop_type === 'start' ? 'border-green-300' :
                            stop.stop_type === 'end' ? 'border-red-300' : 'border-gray-300'
                          }`}
                        >
                          <option value="start">Start</option>
                          <option value="stop">Stop</option>
                          <option value="end">End</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => removeStop(index)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Coordinate hint when geocoded */}
                      {hasCoords && (
                        <div className="ml-11 mt-1 flex items-center gap-2">
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <FiCheck className="w-3 h-3" />
                            Located
                          </span>
                          <span className="text-xs text-gray-400">
                            {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

          <button type="button" onClick={addStop} className="mt-3 btn-secondary text-sm">
            <FiPlus className="w-4 h-4 mr-1" />
            Add Stop
          </button>

          {/* Route Distance Summary */}
          {segmentDistances.length > 0 && (
            <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FiMapPin className="w-4 h-4 text-blue-500" />
                Route Summary
                <span className="text-xs font-normal text-gray-400 ml-auto">Approx. straight-line distances</span>
              </h3>
              <div className="space-y-2">
                {segmentDistances.map((seg, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium text-gray-700">{seg.from}</span>
                      <span className="text-gray-400">→</span>
                      <span className="truncate text-gray-600">{seg.to}</span>
                    </div>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">{seg.distance} km</span>
                  </div>
                ))}
                <div className="border-t border-blue-200 pt-2 mt-2">
                  <div className="flex items-center justify-between text-sm font-bold">
                    <span className="text-gray-800">Total Distance</span>
                    <span className="text-primary-700 text-base">{totalDistance} km</span>
                  </div>
                </div>
              </div>

              {/* Mileage & Fuel Estimate */}
              <div className="mt-3 pt-3 border-t border-blue-200">
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Mileage:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tripMileageOverride}
                      onChange={(e) => setTripMileageOverride(e.target.value)}
                      className="input-field w-20 text-center text-sm"
                      placeholder={vehicleMileage ? vehicleMileage.toString() : '7'}
                      min="0"
                      step="0.1"
                    />
                    <span className="text-sm text-gray-500">km/l</span>
                  </div>
                  {vehicleMileage > 0 && (
                    <span className="text-xs text-gray-400">
                      (Vehicle standard: {vehicleMileage} km/l)
                    </span>
                  )}
                  {!vehicleMileage && !tripMileageOverride && (
                    <span className="text-xs text-amber-500">Set mileage to estimate fuel</span>
                  )}
                </div>
                {effectiveMileage > 0 && totalDistance > 0 && (
                  <div className="flex items-center gap-4 text-sm bg-white/60 rounded-lg p-2.5">
                    <div>
                      <span className="text-gray-500">Est. Diesel:</span>
                      <span className="ml-1.5 font-bold text-amber-700">{estimatedDiesel} liters</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Cost (₹{dieselRate}/L):</span>
                      <span className="ml-1.5 font-bold text-green-700">₹{(estimatedDiesel * dieselRate).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="input-field"
            placeholder="Any special instructions or notes about this trip..."
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving || !availability.available} className="btn-primary">
            {saving ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                Saving...
              </>
            ) : (
              <>
                <FiSave className="w-4 h-4 mr-2" />
                {isEdit ? 'Update Trip' : 'Create Trip'}
              </>
            )}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
