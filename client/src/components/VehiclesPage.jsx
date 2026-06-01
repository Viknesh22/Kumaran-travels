import { useState, useEffect } from 'react';
import { vehiclesAPI } from '../utils/api';
import { FiPlus, FiEdit2, FiTrash2, FiTruck, FiCheck, FiX } from 'react-icons/fi';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [formData, setFormData] = useState({
    registration_number: '',
    vehicle_name: '',
    capacity: 12,
    mileage_kmpl: '',
  });

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      const res = await vehiclesAPI.getAll();
      setVehicles(res.data);
    } catch (err) {
      console.error('Failed to load vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editVehicle) {
        await vehiclesAPI.update(editVehicle.id, formData);
      } else {
        await vehiclesAPI.create(formData);
      }
      setFormData({ registration_number: '', vehicle_name: '', capacity: 12, mileage_kmpl: '' });
      setShowForm(false);
      setEditVehicle(null);
      loadVehicles();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save vehicle');
    }
  };

  const handleEdit = (vehicle) => {
    setEditVehicle(vehicle);
    setFormData({
      registration_number: vehicle.registration_number,
      vehicle_name: vehicle.vehicle_name,
      capacity: vehicle.capacity,
      mileage_kmpl: vehicle.mileage_kmpl || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vehicle permanently?')) return;
    try {
      await vehiclesAPI.delete(id);
      loadVehicles();
    } catch (err) {
      alert('Failed to delete vehicle');
    }
  };

  const toggleActive = async (vehicle) => {
    try {
      await vehiclesAPI.update(vehicle.id, { is_active: vehicle.is_active ? 0 : 1 });
      loadVehicles();
    } catch (err) {
      console.error('Toggle active failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
          <p className="text-sm text-gray-500 mt-1">{vehicles.length} vehicles in fleet</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditVehicle(null); setFormData({ registration_number: '', vehicle_name: '', capacity: 12 }); }} className="btn-primary">
          <FiPlus className="w-4 h-4 mr-2" />
          Add Vehicle
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">{editVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number *</label>
              <input
                type="text"
                required
                value={formData.registration_number}
                onChange={(e) => setFormData({ ...formData, registration_number: e.target.value.toUpperCase() })}
                className="input-field"
                placeholder="TN45AX1234"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Name *</label>
              <input
                type="text"
                required
                value={formData.vehicle_name}
                onChange={(e) => setFormData({ ...formData, vehicle_name: e.target.value })}
                className="input-field"
                placeholder="Force Traveller"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 12 })}
                className="input-field"
                min="1"
                max="50"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mileage (km/l)</label>
              <input
                type="number"
                value={formData.mileage_kmpl}
                onChange={(e) => setFormData({ ...formData, mileage_kmpl: e.target.value })}
                className="input-field"
                placeholder="e.g., 7"
                min="0"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">Standard fuel efficiency of the vehicle</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">
              {editVehicle ? 'Update Vehicle' : 'Add Vehicle'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditVehicle(null); }} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {vehicles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.map(vehicle => (
            <div key={vehicle.id} className={`bg-white rounded-xl border p-5 card-hover ${vehicle.is_active ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                    <FiTruck className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{vehicle.vehicle_name}</h3>
                    <p className="text-sm text-gray-500">{vehicle.registration_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(vehicle)} className={`p-1.5 rounded-lg transition-colors ${vehicle.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`} title={vehicle.is_active ? 'Deactivate' : 'Activate'}>
                    {vehicle.is_active ? <FiCheck className="w-4 h-4" /> : <FiX className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleEdit(vehicle)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <FiEdit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(vehicle.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>                <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Capacity</p>
                  <p className="font-medium">{vehicle.capacity} seats</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Active Trips</p>
                  <p className="font-medium">{vehicle.active_trips || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Mileage</p>
                  <p className="font-medium">{vehicle.mileage_kmpl ? `${vehicle.mileage_kmpl} km/l` : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${vehicle.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {vehicle.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">Owner: {vehicle.owner_name}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FiTruck className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No vehicles registered</h3>
          <p className="text-sm text-gray-500 mb-4">Add your first vehicle to start managing trips</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <FiPlus className="w-4 h-4 mr-2" />
            Add Vehicle
          </button>
        </div>
      )}
    </div>
  );
}
