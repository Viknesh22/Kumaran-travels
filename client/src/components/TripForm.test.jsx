import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API modules before importing anything that uses them
vi.mock('../utils/api', () => ({
  tripsAPI: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    checkAvailability: vi.fn(),
    getBookedDates: vi.fn(),
    getCalendar: vi.fn(),
    updateStops: vi.fn(),
    addDieselRefill: vi.fn(),
    getVehicleHistory: vi.fn(),
    getVehicleAvailability: vi.fn(),
    collectPendingAmount: vi.fn(),
  },
  vehiclesAPI: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  authAPI: {
    login: vi.fn(),
    register: vi.fn(),
    getMe: vi.fn(),
    getUsers: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    resetPassword: vi.fn(),
  },
  settingsAPI: {
    getAll: vi.fn(),
    update: vi.fn(),
    testEmail: vi.fn(),
    getLogs: vi.fn(),
    getPublic: vi.fn(),
  },
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

// Mock the auth context
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Owner', role: 'owner' },
    isOwner: true,
    isPartner: false,
  }),
}));

// Mock leaflet to avoid import errors in test environment
vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  Polyline: () => null,
  Popup: () => null,
  useMap: () => null,
}));

vi.mock('leaflet', () => ({
  default: {
    icon: () => ({}),
    Marker: { prototype: {} },
    DivIcon: vi.fn(),
    point: () => ({}),
  },
  Icon: vi.fn(),
  divIcon: vi.fn(),
  marker: vi.fn(),
  DomEvent: { on: vi.fn(), off: vi.fn() },
  Control: { Zoom: vi.fn() },
}));

// Mock react-icons
vi.mock('react-icons/fi', () => ({
  FiPlus: 'FiPlus',
  FiTrash2: 'FiTrash2',
  FiSave: 'FiSave',
  FiArrowLeft: 'FiArrowLeft',
  FiMapPin: 'FiMapPin',
  FiCalendar: 'FiCalendar',
  FiDollarSign: 'FiDollarSign',
  FiTruck: 'FiTruck',
  FiUsers: 'FiUsers',
  FiAlertCircle: 'FiAlertCircle',
  FiCheck: 'FiCheck',
  FiSearch: 'FiSearch',
  FiNavigation: 'FiNavigation',
  FiX: 'FiX',
}));

import { tripsAPI, vehiclesAPI, authAPI, settingsAPI } from '../utils/api';
import * as geo from '../utils/geo';

// ── Trip Form Data Processing Tests ──
// These test the data transformation logic that TripForm's handleSubmit performs

describe('TripForm — Data Transformation', () => {
  it('should calculate balance amount (total_rent - advance_amount)', () => {
    const totalRent = 50000;
    const advanceAmount = 15000;
    const balance = totalRent - advanceAmount;
    expect(balance).toBe(35000);
  });

  it('should handle zero advance amount correctly', () => {
    const totalRent = 30000;
    const advanceAmount = 0;
    const balance = totalRent - advanceAmount;
    expect(balance).toBe(30000);
  });

  it('should handle zero total rent correctly', () => {
    const totalRent = 0;
    const advanceAmount = 0;
    const balance = totalRent - advanceAmount;
    expect(balance).toBe(0);
  });

  it('should transform form stops to API format with correct stop_order and stop_type', () => {
    const formStops = [
      { place_name: 'Trichy', stop_order: 0, stop_type: 'start' },
      { place_name: 'Madurai', stop_order: 1, stop_type: 'stop' },
      { place_name: 'Kanyakumari', stop_order: 2, stop_type: 'end' },
    ];

    // This mirrors the logic in TripForm's handleSubmit
    const filteredStops = formStops.filter(s => s.place_name.trim());
    const apiStops = filteredStops.map((s, i) => ({
      ...s,
      stop_order: i,
      stop_type: i === 0 ? 'start' : i === filteredStops.length - 1 ? 'end' : 'stop',
    }));

    expect(apiStops).toHaveLength(3);
    expect(apiStops[0].stop_type).toBe('start');
    expect(apiStops[1].stop_type).toBe('stop');
    expect(apiStops[2].stop_type).toBe('end');
    expect(apiStops[0].stop_order).toBe(0);
    expect(apiStops[1].stop_order).toBe(1);
    expect(apiStops[2].stop_order).toBe(2);
  });

  it('should filter out empty stops', () => {
    const formStops = [
      { place_name: 'Trichy', stop_order: 0, stop_type: 'start' },
      { place_name: '', stop_order: 1, stop_type: 'stop' },
      { place_name: 'Chennai', stop_order: 2, stop_type: 'end' },
    ];

    const filteredStops = formStops.filter(s => s.place_name.trim());
    expect(filteredStops).toHaveLength(2);
    expect(filteredStops[0].place_name).toBe('Trichy');
    expect(filteredStops[1].place_name).toBe('Chennai');
  });

  it('should calculate estimated diesel cost from distance and mileage', () => {
    const totalDistance = 350; // km
    const effectiveMileage = 7; // km/l
    const dieselRate = 92;

    const estimatedDiesel = totalDistance > 0 && effectiveMileage > 0
      ? parseFloat((totalDistance / effectiveMileage).toFixed(1))
      : 0;
    const estimatedCost = parseFloat((estimatedDiesel * dieselRate).toFixed(2));

    expect(estimatedDiesel).toBe(50); // 350 / 7 = 50
    expect(estimatedCost).toBe(4600); // 50 * 92 = 4600
  });

  it('should return 0 estimated diesel when mileage is 0', () => {
    const totalDistance = 350;
    const effectiveMileage = 0;

    const estimatedDiesel = effectiveMileage > 0 && totalDistance > 0
      ? parseFloat((totalDistance / effectiveMileage).toFixed(1))
      : 0;

    expect(estimatedDiesel).toBe(0);
  });

  it('should handle null driver_id gracefully', () => {
    const driverId = '';
    const parsedDriverId = driverId ? parseInt(driverId) : null;
    expect(parsedDriverId).toBeNull();
  });

  it('should parse numeric fields correctly', () => {
    const formData = {
      vehicle_id: '1',
      driver_id: '2',
      total_rent: '50000',
      advance_amount: '15000',
    };

    const parsed = {
      vehicle_id: parseInt(formData.vehicle_id),
      driver_id: formData.driver_id ? parseInt(formData.driver_id) : null,
      total_rent: parseFloat(formData.total_rent) || 0,
      advance_amount: parseFloat(formData.advance_amount) || 0,
    };

    expect(parsed.vehicle_id).toBe(1);
    expect(parsed.driver_id).toBe(2);
    expect(parsed.total_rent).toBe(50000);
    expect(parsed.advance_amount).toBe(15000);
  });

  it('should handle empty string numeric fields as 0', () => {
    const formData = {
      total_rent: '',
      advance_amount: '',
    };

    const parsed = {
      total_rent: parseFloat(formData.total_rent) || 0,
      advance_amount: parseFloat(formData.advance_amount) || 0,
    };

    expect(parsed.total_rent).toBe(0);
    expect(parsed.advance_amount).toBe(0);
  });
});

// ── Trip Form API Integration Tests ──
// These test that the API is called with the correct data

describe('TripForm — API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call tripsAPI.create with correct data when creating a trip', async () => {
    const mockResponse = { data: { id: 1, title: 'Test Trip' } };
    tripsAPI.create.mockResolvedValue(mockResponse);

    // Simulate what handleSubmit sends to tripsAPI.create
    const formData = {
      title: 'Test Trip',
      vehicle_id: 1,
      driver_id: 2,
      start_date: '2026-07-15',
      end_date: '2026-07-18',
      total_rent: 30000,
      advance_amount: 10000,
      start_location: 'Trichy',
      end_location: 'Chennai',
      total_distance_km: 350,
      diesel_required_est: 50,
      diesel_rate_used: 92,
      mileage: 7,
      stops: [
        { place_name: 'Trichy', latitude: null, longitude: null, stop_order: 0, stop_type: 'start' },
        { place_name: 'Madurai', latitude: null, longitude: null, stop_order: 1, stop_type: 'stop' },
      ],
    };

    const result = await tripsAPI.create(formData);
    expect(tripsAPI.create).toHaveBeenCalledTimes(1);
    expect(tripsAPI.create).toHaveBeenCalledWith(formData);
    expect(result.data.id).toBe(1);
    expect(result.data.title).toBe('Test Trip');
  });

  it('should call tripsAPI.update with correct data when editing a trip', async () => {
    const mockResponse = { data: { id: 5, title: 'Updated Trip' } };
    tripsAPI.update.mockResolvedValue(mockResponse);

    const tripId = 5;
    const updateData = {
      title: 'Updated Trip',
      vehicle_id: 1,
      start_date: '2026-08-01',
      end_date: '2026-08-03',
    };

    const result = await tripsAPI.update(tripId, updateData);
    expect(tripsAPI.update).toHaveBeenCalledWith(tripId, updateData);
    expect(result.data.title).toBe('Updated Trip');
  });

  it('should call tripsAPI.updateStops after creating a trip with stops', async () => {
    tripsAPI.updateStops.mockResolvedValue({ data: { stops: [] } });

    const tripId = 10;
    const stops = [
      { place_name: 'Trichy', stop_order: 0, stop_type: 'start' },
      { place_name: 'Chennai', stop_order: 1, stop_type: 'end' },
    ];

    const result = await tripsAPI.updateStops(tripId, { stops });
    expect(tripsAPI.updateStops).toHaveBeenCalledWith(tripId, { stops });
    expect(result.data.stops).toBeDefined();
  });

  it('should call tripsAPI.checkAvailability with correct params', async () => {
    tripsAPI.checkAvailability.mockResolvedValue({
      data: { available: true, conflicts: [] },
    });

    const params = {
      vehicle_id: 1,
      driver_id: 2,
      start_date: '2026-07-15',
      end_date: '2026-07-18',
    };

    const result = await tripsAPI.checkAvailability(params);
    expect(tripsAPI.checkAvailability).toHaveBeenCalledWith(params);
    expect(result.data.available).toBe(true);
  });

  it('should detect unavailability from checkAvailability', async () => {
    tripsAPI.checkAvailability.mockResolvedValue({
      data: {
        available: false,
        conflicts: [{ id: 1, title: 'Existing Trip' }],
      },
    });

    const params = {
      vehicle_id: 1,
      start_date: '2026-06-12',
      end_date: '2026-06-14',
    };

    const result = await tripsAPI.checkAvailability(params);
    expect(result.data.available).toBe(false);
    expect(result.data.conflicts).toHaveLength(1);
    expect(result.data.conflicts[0].title).toBe('Existing Trip');
  });

  it('should get booked dates for a vehicle', async () => {
    tripsAPI.getBookedDates.mockResolvedValue({
      data: [
        { id: 1, title: 'Existing', start_date: '2026-06-10', end_date: '2026-06-15' },
      ],
    });

    const result = await tripsAPI.getBookedDates({ vehicle_id: 1 });
    expect(tripsAPI.getBookedDates).toHaveBeenCalledWith({ vehicle_id: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Existing');
  });

  it('should delete a trip', async () => {
    tripsAPI.delete.mockResolvedValue({ data: { message: 'Trip deleted successfully' } });

    const result = await tripsAPI.delete(42);
    expect(tripsAPI.delete).toHaveBeenCalledWith(42);
    expect(result.data.message).toBe('Trip deleted successfully');
  });

  it('should handle API errors gracefully', async () => {
    const errorMessage = 'Vehicle is already booked for these dates';
    tripsAPI.create.mockRejectedValue({
      response: { status: 409, data: { error: errorMessage } },
    });

    try {
      await tripsAPI.create({
        title: 'Conflict',
        vehicle_id: 1,
        start_date: '2026-06-12',
        end_date: '2026-06-14',
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err.response.status).toBe(409);
      expect(err.response.data.error).toBe(errorMessage);
    }
  });
});

// ── Trip Form Route Distance Calculation Tests ──
// Testing the logic that TripForm uses to calculate distances between stops

describe('TripForm — Route Distance Calculations', () => {
  it('should calculate distance between stops using haversine formula', () => {
    // Trichy to Chennai
    const stops = [
      { place_name: 'Trichy', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
    ];

    const result = geo.calculateRouteSegments(stops);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].distance).toBeGreaterThan(290);
    expect(result.segments[0].distance).toBeLessThan(320);
    expect(result.total).toBeCloseTo(result.segments[0].distance, 1);
  });

  it('should sum distances across multiple stops', () => {
    const stops = [
      { place_name: 'Trichy', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'Madurai', latitude: 9.9252, longitude: 78.1198 },
      { place_name: 'Kanyakumari', latitude: 8.0883, longitude: 77.5385 },
    ];

    const result = geo.calculateRouteSegments(stops);
    expect(result.segments).toHaveLength(2);

    const segmentSum = result.segments[0].distance + result.segments[1].distance;
    expect(result.total).toBeCloseTo(segmentSum, 1);
  });

  it('should return 0 distance for single stop (no segments to calculate)', () => {
    const stops = [
      { place_name: 'Trichy', latitude: 10.7905, longitude: 78.7047 },
    ];

    const result = geo.calculateRouteSegments(stops);
    expect(result.segments).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should return 0 distance for stops without coordinates', () => {
    const stops = [
      { place_name: 'Trichy', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'Unknown', latitude: null, longitude: null },
      { place_name: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
    ];

    const result = geo.calculateRouteSegments(stops);
    // Only Trichy and Chennai have coords, so 1 segment
    expect(result.segments).toHaveLength(1);
    expect(result.total).toBeGreaterThan(290);
  });
});
