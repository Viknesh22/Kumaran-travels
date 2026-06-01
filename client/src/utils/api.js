import axios from 'axios';

// Determine the server URL:
// 1. Check localStorage for a user-set server URL (runtime override)
// 2. Fall back to VITE_API_URL env var (set at build time for APK)
// 3. Fall back to '/api' (Vite dev proxy)
function getBaseURL() {
  const stored = localStorage.getItem('server_url');
  if (stored) return stored;
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return '/api';
}

// Check if the current connection is pointing to a remote/cloud server (not localhost)
export function isCloudConnection() {
  const url = getBaseURL();
  if (url === '/api') return false;
  try {
    const parsed = new URL(url);
    return !['localhost', '127.0.0.1', '10.0.2.2'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export { getBaseURL };

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
});

// Refresh baseURL on each request so runtime changes take effect
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Always read the latest server URL from localStorage
  config.baseURL = getBaseURL();
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  getUsers: (params) => api.get('/auth/users', { params }),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
  resetPassword: (id, data) => api.post(`/auth/users/${id}/reset-password`, data),
};

// Trips API
export const tripsAPI = {
  getAll: (params) => api.get('/trips', { params }),
  getById: (id) => api.get(`/trips/${id}`),
  create: (data) => api.post('/trips', data),
  update: (id, data) => api.put(`/trips/${id}`, data),
  delete: (id) => api.delete(`/trips/${id}`),
  checkAvailability: (params) => api.get('/trips/availability', { params }),
  getBookedDates: (params) => api.get('/trips/booked-dates', { params }),
  getCalendar: (params) => api.get('/trips/calendar', { params }),
  updateStops: (id, data) => api.put(`/trips/${id}/stops`, data),
  addDieselRefill: (id, data) => api.post(`/trips/${id}/diesel-refill`, data),
  getVehicleHistory: (vehicleId) => api.get(`/trips/vehicle/${vehicleId}/history`),
  getVehicleAvailability: (params) => api.get('/trips/vehicle-availability', { params }),
  collectPendingAmount: (id, data) => api.post(`/trips/${id}/collect-pending`, data),
};

// Vehicles API
export const vehiclesAPI = {
  getAll: () => api.get('/vehicles'),
  getById: (id) => api.get(`/vehicles/${id}`),
  create: (data) => api.post('/vehicles', data),
  update: (id, data) => api.put(`/vehicles/${id}`, data),
  delete: (id) => api.delete(`/vehicles/${id}`),
};

// Expenses API
export const expensesAPI = {
  getByTrip: (tripId) => api.get(`/expenses/trip/${tripId}`),
  add: (tripId, data) => api.post(`/expenses/trip/${tripId}`, data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  getPayments: (tripId) => api.get(`/expenses/payments/trip/${tripId}`),
  addPayment: (tripId, data) => api.post(`/expenses/payments/trip/${tripId}`, data),
  deletePayment: (id) => api.delete(`/expenses/payments/${id}`),
  getMaintenance: () => api.get('/expenses/maintenance'),
  addMaintenance: (data) => api.post('/expenses/maintenance', data),
};

// Dashboard API
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getRevenueChart: (params) => api.get('/dashboard/revenue-chart', { params }),
  getVehicleUtilization: () => api.get('/dashboard/vehicle-utilization'),
  getDriverPerformance: () => api.get('/dashboard/driver-performance'),
  getExpenseBreakdown: (params) => api.get('/dashboard/expense-breakdown', { params }),
};

// Settings API
export const settingsAPI = {
  getAll: () => api.get('/settings'),
  update: (settings) => api.put('/settings', { settings }),
  testEmail: (email) => api.post('/settings/test-email', { email }),
  getLogs: (params) => api.get('/settings/log', { params }),
  getPublic: () => api.get('/settings/public'),
};

export default api;
