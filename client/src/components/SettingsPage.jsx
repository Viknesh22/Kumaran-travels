import { useState, useEffect, Fragment } from 'react';
import { settingsAPI, authAPI } from '../utils/api';
import { FiMail, FiDroplet, FiCheck, FiX, FiRefreshCw, FiInfo, FiSend, FiClock, FiCheckCircle, FiAlertCircle, FiUsers, FiPlus, FiEdit2, FiTrash2, FiSearch, FiLock, FiServer } from 'react-icons/fi';

const SETTING_FIELDS = [
  { key: 'SMTP_HOST', label: 'SMTP Host', placeholder: 'smtp.gmail.com', type: 'text' },
  { key: 'SMTP_PORT', label: 'SMTP Port', placeholder: '587', type: 'number' },
  { key: 'SMTP_SECURE', label: 'Use TLS/SSL', type: 'select', options: [
    { value: 'true', label: 'Yes (SSL - port 465)' },
    { value: 'false', label: 'No (STARTTLS - port 587)' },
  ]},
  { key: 'SMTP_USER', label: 'Username', placeholder: 'your@email.com', type: 'text' },
  { key: 'SMTP_PASS', label: 'Password / App Password', placeholder: 'Enter password', type: 'password' },
  { key: 'SMTP_FROM', label: 'From Address', placeholder: 'notifications@kumaran-travels.com', type: 'text', hint: 'Strongly recommended — some providers reject emails without a matching FROM address' },
  { key: 'SMTP_REJECT_UNAUTHORIZED', label: 'Verify SSL Certificate', type: 'select', options: [
    { value: 'true', label: 'Yes (recommended)' },
    { value: 'false', label: 'No (for self-signed certs)' },
  ]},
];

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Driver management state
  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [driverForm, setDriverForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [driverFormError, setDriverFormError] = useState('');
  const [driverFormSaving, setDriverFormSaving] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [resettingDriverId, setResettingDriverId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const filteredDrivers = driverSearch.trim()
    ? drivers.filter(d =>
        d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
        d.email.toLowerCase().includes(driverSearch.toLowerCase())
      )
    : drivers;

  useEffect(() => { loadSettings(); loadLogs(); loadDrivers(); }, []);

  const loadSettings = async () => {
    try {
      const res = await settingsAPI.getAll();
      setSettings(res.data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await settingsAPI.getLogs({ limit: 20 });
      setLogs(res.data.logs);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadDrivers = async () => {
    setDriversLoading(true);
    try {
      const res = await authAPI.getUsers({ role: 'driver' });
      setDrivers(res.data);
    } catch (err) {
      console.error('Failed to load drivers:', err);
    } finally {
      setDriversLoading(false);
    }
  };

  const resetDriverForm = () => {
    setDriverForm({ name: '', email: '', phone: '', password: '' });
    setDriverFormError('');
    setEditingDriver(null);
    setShowDriverForm(false);
  };

  const handleEditDriver = (driver) => {
    setEditingDriver(driver);
    setDriverForm({ name: driver.name, email: driver.email, phone: driver.phone || '', password: '' });
    setDriverFormError('');
    setShowDriverForm(true);
  };

  const handleSaveDriver = async (e) => {
    e.preventDefault();
    setDriverFormError('');
    setDriverFormSaving(true);

    try {
      if (editingDriver) {
        const data = { name: driverForm.name, email: driverForm.email, phone: driverForm.phone };
        if (driverForm.password) data.password = driverForm.password;
        await authAPI.updateUser(editingDriver.id, data);
      } else {
        await authAPI.register({ ...driverForm, role: 'driver' });
      }
      resetDriverForm();
      loadDrivers();
    } catch (err) {
      setDriverFormError(err.response?.data?.error || 'Failed to save driver');
    } finally {
      setDriverFormSaving(false);
    }
  };

  const handleDeleteDriver = async (driver) => {
    if (!window.confirm(`Delete driver "${driver.name}"? This cannot be undone.`)) return;
    try {
      await authAPI.deleteUser(driver.id);
      loadDrivers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete driver');
    }
  };

  const handleResetPassword = async (driver) => {
    if (!resetPassword || resetPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    setResetSaving(true);
    try {
      await authAPI.resetPassword(driver.id, { password: resetPassword });
      setResettingDriverId(null);
      setResetPassword('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setResetSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => prev.map(s => s.setting_key === key ? { ...s, setting_value: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await settingsAPI.update(settings);
      setSettings(res.data);
      setSaveMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save settings' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  const handleTest = async () => {
    if (!testEmail) return;
    setTesting(true);
    setTestResult(null);
    try {
      await settingsAPI.testEmail(testEmail);
      setTestResult({ type: 'success', text: `Test email sent to ${testEmail}! Check your inbox.` });
    } catch (err) {
      setTestResult({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to send test email' });
    } finally {
      setTesting(false);
    }
  };

  const getValue = (key) => settings.find(s => s.setting_key === key)?.setting_value || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
      {/* Server Connection */}
      <ServerConnectionSection />

      {/* Driver Management */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiUsers className="w-6 h-6 text-primary-500" />
            Driver Management
          </h1>
          <button
            onClick={() => { resetDriverForm(); setShowDriverForm(!showDriverForm); }}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <FiPlus className="w-4 h-4" />
            {showDriverForm ? 'Cancel' : 'Add Driver'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Manage drivers who can be assigned to trips. New drivers will receive login credentials.
        </p>
      </div>

      {/* Add/Edit Driver Form */}
      {showDriverForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingDriver ? `Edit Driver: ${editingDriver.name}` : 'Add New Driver'}
          </h3>
          {driverFormError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <FiAlertCircle className="w-4 h-4 inline mr-1" />
              {driverFormError}
            </div>
          )}
          <form onSubmit={handleSaveDriver} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={driverForm.name}
                  onChange={e => setDriverForm({ ...driverForm, name: e.target.value })}
                  className="input-field"
                  placeholder="e.g., Rajesh Kumar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={driverForm.email}
                  onChange={e => setDriverForm({ ...driverForm, email: e.target.value })}
                  className="input-field"
                  placeholder="driver@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={driverForm.phone}
                  onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })}
                  className="input-field"
                  placeholder="9876543210"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingDriver ? 'New Password (leave blank to keep current)' : 'Password *'}
                </label>
                <input
                  type="password"
                  required={!editingDriver}
                  value={driverForm.password}
                  onChange={e => setDriverForm({ ...driverForm, password: e.target.value })}
                  className="input-field"
                  placeholder={editingDriver ? 'Leave blank to keep current' : 'Set a default password'}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={driverFormSaving} className="btn-primary">
                {driverFormSaving ? (
                  <span className="flex items-center gap-2">
                    <FiRefreshCw className="w-4 h-4 animate-spin" />
                    {editingDriver ? 'Updating...' : 'Adding...'}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <FiCheck className="w-4 h-4" />
                    {editingDriver ? 'Update Driver' : 'Add Driver'}
                  </span>
                )}
              </button>
              <button type="button" onClick={resetDriverForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search Bar */}
      {drivers.length > 0 && (
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={driverSearch}
            onChange={e => setDriverSearch(e.target.value)}
            placeholder="Search drivers by name or email..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      )}

      {/* Drivers List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {driversLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredDrivers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Email</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Phone</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map(driver => (
                  <Fragment key={driver.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{driver.name}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{driver.email}</td>
                      <td className="py-3 px-4 text-gray-600">{driver.phone || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleEditDriver(driver)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-1"
                          title="Edit driver"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setResettingDriverId(resettingDriverId === driver.id ? null : driver.id)}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors mr-1"
                          title="Reset password"
                        >
                          <FiLock className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDriver(driver)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete driver"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {resettingDriverId === driver.id && (
                      <tr key={`${driver.id}-reset`} className="bg-amber-50/50">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <input
                              id={`reset-pw-${driver.id}`}
                              name={`reset-pw-${driver.id}`}
                              type="password"
                              value={resetPassword}
                              onChange={e => setResetPassword(e.target.value)}
                              placeholder="Enter new password (min. 6 chars)"
                              className="flex-1 max-w-xs px-3 py-1.5 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                              autoFocus
                              onKeyDown={e => e.key === 'Enter' && handleResetPassword(driver)}
                            />
                            <button
                              onClick={() => handleResetPassword(driver)}
                              disabled={resetSaving}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              {resetSaving ? (
                                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FiCheck className="w-3.5 h-3.5" />
                              )}
                              {resetSaving ? 'Resetting...' : 'Set Password'}
                            </button>
                            <button
                              onClick={() => { setResettingDriverId(null); setResetPassword(''); }}
                              className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <FiUsers className="w-10 h-10 mx-auto mb-3" />
            <p className="text-sm font-medium">
              {driverSearch.trim() ? 'No drivers match your search' : 'No drivers yet'}
            </p>
            <p className="text-xs mt-1">
              {driverSearch.trim() ? 'Try a different name or email' : 'Click "Add Driver" to create driver accounts'}
            </p>
          </div>
        )}
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FiMail className="w-6 h-6 text-primary-500" />
          Email Notification Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure SMTP to send trip confirmation emails to drivers and partners automatically.
        </p>
      </div>

      {/* SMTP Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">SMTP Configuration</h2>
        <p className="text-xs text-gray-500 mb-5">
          Enter your email provider's SMTP details. For Gmail, use an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">App Password</a>.
        </p>

        <div className="space-y-4">
          {SETTING_FIELDS.map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
              {field.hint && <p className="text-xs text-gray-400 mb-1.5">{field.hint}</p>}
              {field.type === 'select' ? (
                <select
                  value={getValue(field.key)}
                  onChange={e => handleChange(field.key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  {field.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={getValue(field.key)}
                  onChange={e => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              )}
            </div>
          ))}
        </div>

        {/* Save feedback */}
        {saveMessage && (
          <div className={`mt-4 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            saveMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {saveMessage.type === 'success' ? <FiCheckCircle className="w-4 h-4" /> : <FiAlertCircle className="w-4 h-4" />}
            {saveMessage.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 btn-primary flex items-center gap-2"
        >
          {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiCheck className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* General Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <FiDroplet className="w-4 h-4 text-amber-500" />
          Fuel Settings
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Configure the diesel rate used to estimate fuel costs in trip planning.
          This rate is used across all new trips for fuel cost estimation.
        </p>

        <div className="max-w-xs mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Diesel Rate (₹/L)</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm font-medium">₹</span>
            <input
              type="number"
              value={getValue('DIESEL_RATE')}
              onChange={e => handleChange('DIESEL_RATE', e.target.value)}
              placeholder="90"
              min="0"
              step="0.5"
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <span className="text-sm text-gray-500">per liter</span>
          </div>
        </div>
        
        {/* Dedicated save button for fuel rate */}
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              const dieselSetting = settings.find(s => s.setting_key === 'DIESEL_RATE') || { setting_key: 'DIESEL_RATE', setting_value: '90' };
              try {
                await settingsAPI.update([dieselSetting]);
                setSaveMessage({ type: 'success', text: `Diesel rate saved as ₹${dieselSetting.setting_value}/L` });
                setTimeout(() => setSaveMessage(null), 3000);
              } catch (err) {
                setSaveMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save diesel rate' });
                setTimeout(() => setSaveMessage(null), 3000);
              }
            }}
            className="btn-primary text-sm bg-amber-600 hover:bg-amber-700 flex items-center gap-1.5"
          >
            <FiCheck className="w-3.5 h-3.5" />
            Save Diesel Rate
          </button>
          <p className="text-xs text-gray-400">
            Rate is applied to new trips and route calculations
          </p>
        </div>
        
        {/* Current rate display */}
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <FiInfo className="w-3 h-3" />
          Current rate: <strong className="text-gray-700">₹{getValue('DIESEL_RATE') || '90'}/L</strong>
          {getValue('DIESEL_RATE') && (
            <span>
              (Default: ₹90/L — saved value: ₹{getValue('DIESEL_RATE')}/L)
            </span>
          )}
        </div>
      </div>

      {/* Test Email */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Test Email</h2>
        <p className="text-xs text-gray-500 mb-4">
          Send a test email to verify your SMTP configuration is working correctly.
        </p>

        <div className="flex items-center gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={handleTest}
            disabled={testing || !testEmail}
            className="btn-secondary flex items-center gap-2 whitespace-nowrap"
          >
            {testing ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSend className="w-4 h-4" />}
            {testing ? 'Sending...' : 'Send Test'}
          </button>
        </div>

        {testResult && (
          <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            testResult.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {testResult.type === 'success' ? <FiCheck className="w-4 h-4" /> : <FiX className="w-4 h-4" />}
            {testResult.text}
          </div>
        )}
      </div>

      {/* Notification Log */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notification History</h2>
            <p className="text-xs text-gray-500 mt-0.5">Recently sent notifications and their delivery status</p>
          </div>
          <button
            onClick={loadLogs}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Type</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Recipient</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Subject</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 px-2">
                      <span className="capitalize text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {log.notification_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-gray-700">{log.recipient_email}</td>
                    <td className="py-2.5 px-2 text-gray-600 max-w-[200px] truncate">{log.subject || '-'}</td>
                    <td className="py-2.5 px-2">
                      {log.status === 'sent' ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs">
                          <FiCheckCircle className="w-3 h-3" /> Sent
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600 text-xs group relative" title={log.error_message}>
                          <FiAlertCircle className="w-3 h-3" /> Failed
                          {log.error_message && (
                            <span className="absolute bottom-full left-0 bg-gray-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                              {log.error_message}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-gray-400 text-xs whitespace-nowrap">
                      <FiClock className="w-3 h-3 inline mr-1" />
                      {new Date(log.sent_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <FiInfo className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No notifications sent yet</p>
            <p className="text-xs mt-1">Notifications will appear here after you create trips with assigned drivers or partners</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Server Connection Section ──
const ServerConnectionSection = () => {
  const [url, setUrl] = useState(localStorage.getItem('server_url') || '');
  const [tempUrl, setTempUrl] = useState(url);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentOrigin = window.location.origin;

  const handleSave = () => {
    setSaving(true);
    try {
      const finalUrl = tempUrl.trim() || '';
      if (finalUrl) {
        localStorage.setItem('server_url', finalUrl.replace(/\/+$/, ''));
      } else {
        localStorage.removeItem('server_url');
      }
      setUrl(finalUrl);
      setTestResult({ type: 'success', text: finalUrl ? `Server URL saved. App will connect to: ${finalUrl}` : 'Reset to default. Refresh to apply.' });
    } catch (err) {
      setTestResult({ type: 'error', text: 'Failed to save server URL' });
    } finally {
      setSaving(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const handleTestConnection = async () => {
    const testUrl = (tempUrl.trim() || '/api').replace(/\/+$/, '');
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${testUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setTestResult({ type: 'success', text: '✅ Connection successful! Server is reachable.' });
      } else {
        setTestResult({ type: 'error', text: `⚠️ Server responded with status ${res.status}` });
      }
    } catch (err) {
      setTestResult({ type: 'error', text: `❌ Connection failed: ${err.message || 'Server unreachable'}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <FiServer className="w-5 h-5 text-emerald-500" />
        Server Connection
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        For the Android APK, enter the public IP/domain of your server so the app can connect to it.
        Default uses the built-in URL if left empty.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Server API URL</label>
          <input
            type="url"
            value={tempUrl}
            onChange={e => setTempUrl(e.target.value)}
            placeholder="e.g., http://123.123.123.123:3001"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-3">
          {url && (
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              Current: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-emerald-700">{url}</code>
            </div>
          )}
          {!url && (
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
              Default: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{currentOrigin}/api</code>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            {saving ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiCheck className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save URL'}
          </button>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            {testing ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiSend className="w-3.5 h-3.5" />}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {testResult && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            testResult.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {testResult.type === 'success' ? <FiCheckCircle className="w-4 h-4 shrink-0" /> : <FiAlertCircle className="w-4 h-4 shrink-0" />}
            {testResult.text}
          </div>
        )}
      </div>
    </div>
  );
}
