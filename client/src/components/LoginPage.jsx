import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiUser, FiLock, FiMail, FiPhone, FiEye, FiEyeOff, FiTruck, FiServer, FiCheck, FiSend, FiRefreshCw, FiCheckCircle, FiAlertCircle, FiSettings } from 'react-icons/fi';
import { getBaseURL } from '../utils/api';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', phone: '', role: 'driver'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(formData);
      } else {
        await login(formData.email, formData.password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        <div className="relative z-10 flex flex-col justify-center px-12">
          <div className="flex items-center space-x-4 mb-8">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <FiTruck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Kumaran Travels</h1>
              <p className="text-primary-200">Tourist Van Management System</p>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
              <h3 className="text-white font-semibold mb-2">🚐 Complete Trip Management</h3>
              <p className="text-primary-200 text-sm">Manage bookings, track expenses, and monitor fleet performance all in one place.</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
              <h3 className="text-white font-semibold mb-2">🗺️ Map-Integrated Routes</h3>
              <p className="text-primary-200 text-sm">Plan routes with stops, calculate distances, and estimate diesel requirements automatically.</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
              <h3 className="text-white font-semibold mb-2">👥 Role-Based Access</h3>
              <p className="text-primary-200 text-sm">Owner, partners, and drivers each get tailored views and controls.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="lg:hidden inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
              <FiTruck className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {isRegister
                ? 'Register to manage your travel business'
                : 'Sign in to access your dashboard'
              }
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <div className="relative">
                    <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-field pl-10"
                      placeholder="Enter your name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <div className="relative">
                    <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="input-field pl-10"
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="input-field"
                  >
                    <option value="owner">Owner</option>
                    <option value="partner">Partner</option>
                    <option value="driver">Driver</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input-field pl-10"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input-field pl-10 pr-10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                  {isRegister ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : (
                isRegister ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-sm text-primary-600 hover:text-primary-500 font-medium"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>

          {/* Server Connection - accessible before login */}
          <div className="mt-6">
            <button
              onClick={() => setShowServerConfig(!showServerConfig)}
              className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FiServer className="w-4 h-4" />
              {showServerConfig ? 'Hide Server Settings' : 'Configure Server Connection'}
            </button>

            {showServerConfig && (
              <ServerConfigSection />
            )}
          </div>

          {/* Demo credentials hint */}
          <div className="mt-6 p-4 bg-gray-100 rounded-lg">
            <p className="text-xs text-gray-500 font-medium mb-2">Demo Accounts:</p>
            <div className="space-y-1 text-xs text-gray-500">
              <p>Owner: owner@kumaran.com / password123</p>
              <p>Partner: partner@kumaran.com / password123</p>
              <p>Driver: driver@kumaran.com / password123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Server Config Section (accessible before login) ──
function ServerConfigSection() {
  const currentUrl = localStorage.getItem('server_url') || '';
  const [tempUrl, setTempUrl] = useState(currentUrl);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    const finalUrl = tempUrl.trim();
    if (finalUrl) {
      localStorage.setItem('server_url', finalUrl.replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('server_url');
    }
    const activeUrl = finalUrl || getBaseURL();
    setTestResult({ type: 'success', text: `Server URL saved. App will use: ${activeUrl}` });
    setSaving(false);
    setTimeout(() => setTestResult(null), 5000);
  };

  const handleTestConnection = async () => {
    const testUrl = (tempUrl.trim() || getBaseURL()).replace(/\/+$/, '');
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${testUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setTestResult({ type: 'success', text: 'Connection successful! Server is reachable.' });
      } else {
        setTestResult({ type: 'error', text: `Server responded with status ${res.status}` });
      }
    } catch (err) {
      setTestResult({ type: 'error', text: `Connection failed: ${err.message || 'Server unreachable'}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-3 p-4 bg-white border border-gray-200 rounded-xl space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <FiSettings className="w-4 h-4 text-emerald-500" />
        Server URL
      </div>
      <p className="text-xs text-gray-500">
        Enter the IP address or domain of your backend server (e.g., http://192.168.1.100:3001)
      </p>
      <input
        type="url"
        value={tempUrl}
        onChange={(e) => setTempUrl(e.target.value)}
        placeholder="e.g., http://192.168.1.100:3001"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
        >
          {saving ? <FiRefreshCw className="w-3 h-3 animate-spin" /> : <FiCheck className="w-3 h-3" />}
          Save
        </button>
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
        >
          {testing ? <FiRefreshCw className="w-3 h-3 animate-spin" /> : <FiSend className="w-3 h-3" />}
          Test
        </button>
      </div>
      {testResult && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          testResult.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {testResult.type === 'success' ? <FiCheckCircle className="w-3.5 h-3.5 shrink-0" /> : <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {testResult.text}
        </div>
      )}
    </div>
  );
}
