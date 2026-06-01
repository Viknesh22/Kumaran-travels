import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import TripList from './components/TripList';
import TripForm from './components/TripForm';
import TripDetail from './components/TripDetail';
import CalendarView from './components/CalendarView';
import VehiclesPage from './components/VehiclesPage';
import SettingsPage from './components/SettingsPage';
import Layout from './components/Layout';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading Kumaran Travels...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      
      <Route path="/dashboard" element={
        <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
      } />
      
      <Route path="/trips" element={
        <ProtectedRoute><Layout><TripList /></Layout></ProtectedRoute>
      } />
      
      <Route path="/trips/new" element={
        <ProtectedRoute allowedRoles={['owner', 'partner']}><Layout><TripForm /></Layout></ProtectedRoute>
      } />
      
      <Route path="/trips/:id" element={
        <ProtectedRoute><Layout><TripDetail /></Layout></ProtectedRoute>
      } />
      
      <Route path="/trips/:id/edit" element={
        <ProtectedRoute allowedRoles={['owner', 'partner']}><Layout><TripForm /></Layout></ProtectedRoute>
      } />
      
      <Route path="/calendar" element={
        <ProtectedRoute><Layout><CalendarView /></Layout></ProtectedRoute>
      } />
      
      <Route path="/vehicles" element={
        <ProtectedRoute allowedRoles={['owner']}><Layout><VehiclesPage /></Layout></ProtectedRoute>
      } />
      
      <Route path="/settings" element={
        <ProtectedRoute allowedRoles={['owner']}><Layout><SettingsPage /></Layout></ProtectedRoute>
      } />
      
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
