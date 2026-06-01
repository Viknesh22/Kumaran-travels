import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tripsAPI, vehiclesAPI, authAPI } from '../utils/api';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiTruck, FiUsers, FiMapPin, FiDollarSign } from 'react-icons/fi';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const statusColors = {
  planned: 'bg-blue-100 text-blue-800 border-blue-200',
  ongoing: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedDriver, setSelectedDriver] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const loadData = async () => {
    try {
      const [tripsRes, vehiclesRes, usersRes] = await Promise.all([
        tripsAPI.getCalendar({
          year: currentDate.getFullYear(),
          month: String(currentDate.getMonth() + 1),
        }),
        vehiclesAPI.getAll(),
        authAPI.getUsers(),
      ]);
      setBookings(tripsRes.data);
      setVehicles(vehiclesRes.data);
      setDrivers(usersRes.data.filter(u => u.role === 'driver'));
    } catch (err) {
      console.error('Failed to load calendar data:', err);
    } finally {
      setLoading(false);
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const getBookingsForDay = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return bookings.filter(b => {
      const start = b.start_date;
      const end = b.end_date;
      if (selectedVehicle !== 'all' && b.vehicle_id !== parseInt(selectedVehicle)) return false;
      if (selectedDriver !== 'all' && b.driver_id !== parseInt(selectedDriver)) return false;
      return dateStr >= start && dateStr <= end;
    });
  };

  const isToday = (day) => {
    const today = new Date();
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  };

  const selectedDayBookings = selectedDay ? getBookingsForDay(selectedDay) : [];

  const filteredBookings = bookings.filter(b => {
    if (selectedVehicle !== 'all' && b.vehicle_id !== parseInt(selectedVehicle)) return false;
    if (selectedDriver !== 'all' && b.driver_id !== parseInt(selectedDriver)) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiCalendar className="w-6 h-6 text-primary-500" />
            Booking Calendar
          </h1>
          <p className="text-sm text-gray-500 mt-1">View all booked dates, vehicle & driver availability</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="input-field text-sm"
          >
            <option value="all">All Vehicles</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.vehicle_name} ({v.registration_number})</option>
            ))}
          </select>
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
            className="input-field text-sm"
          >
            <option value="all">All Drivers</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-900">{MONTHS[month]} {year}</h2>
              <p className="text-sm text-gray-500">{filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''} this month</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg">
                Today
              </button>
              <button onClick={nextMonth} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <FiChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Previous month's trailing days */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`prev-${i}`} className="aspect-square p-1 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-300 text-center">{prevMonthDays - firstDay + 1 + i}</div>
              </div>
            ))}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayBookings = getBookingsForDay(day);
              const isSelected = selectedDay === day;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={`aspect-square p-1 rounded-lg border transition-colors relative ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : dayBookings.length > 0
                        ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                        : 'border-transparent hover:bg-gray-100'
                  }`}
                >
                  <div className={`text-xs font-medium text-center ${isToday(day) ? 'text-primary-600 font-bold' : ''}`}>
                    {day}
                  </div>
                  {dayBookings.length > 0 && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {dayBookings.slice(0, 3).map((b, j) => (
                        <div
                          key={j}
                          className={`w-1.5 h-1.5 rounded-full ${
                            b.status === 'ongoing' ? 'bg-green-500' : b.status === 'planned' ? 'bg-blue-500' : 'bg-gray-500'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">
            {selectedDay
              ? `${MONTHS[month]} ${selectedDay}, ${year}`
              : 'Select a day to view bookings'}
          </h3>

          {selectedDay ? (
            selectedDayBookings.length > 0 ? (
              <div className="space-y-3">
                {selectedDayBookings.map(booking => (
                  <Link
                    key={booking.id}
                    to={`/trips/${booking.id}`}
                    className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{booking.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[booking.status] || statusColors.planned}`}>
                        {booking.status}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-500">
                      <p className="flex items-center gap-1">
                        <FiTruck className="w-3 h-3" />
                        {booking.vehicle_name} ({booking.registration_number})
                      </p>
                      <p className="flex items-center gap-1">
                        <FiCalendar className="w-3 h-3" />
                        {new Date(booking.start_date).toLocaleDateString()} - {new Date(booking.end_date).toLocaleDateString()}
                      </p>
                      {booking.driver_name ? (
                        <p className="flex items-center gap-1 text-gray-500">
                          <FiUsers className="w-3 h-3" />
                          Driver: <span className="font-medium text-gray-700">{booking.driver_name}</span>
                        </p>
                      ) : (
                        <p className="text-gray-300 italic">No driver assigned</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FiCalendar className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No bookings on this day</p>
                <p className="text-xs text-gray-400 mt-1">Vehicle is available for booking</p>
              </div>
            )
          ) : (
            <div className="text-center py-8">
              <FiCalendar className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Click on a date to see details</p>
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Filters</h4>
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
              {selectedVehicle !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                  <FiTruck className="w-3 h-3" />
                  {vehicles.find(v => v.id === parseInt(selectedVehicle))?.vehicle_name}
                </span>
              )}
              {selectedDriver !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">
                  <FiUsers className="w-3 h-3" />
                  {drivers.find(d => d.id === parseInt(selectedDriver))?.name}
                </span>
              )}
              {selectedVehicle === 'all' && selectedDriver === 'all' && (
                <span className="text-gray-400">Showing all bookings</span>
              )}
            </div>
            <h4 className="text-xs font-medium text-gray-500 mb-2">Legend</h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                <span>Planned</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                <span>Ongoing</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-200 border border-blue-300"></div>
                <span>Booked date</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full bg-primary-200 border border-primary-400"></div>
                <span>Selected date</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* All Bookings List */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">All Bookings This Month</h3>
        {filteredBookings.length > 0 ? (
          <div className="space-y-2">
            {filteredBookings.map(booking => (
              <Link
                key={booking.id}
                to={`/trips/${booking.id}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FiTruck className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{booking.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(booking.start_date).toLocaleDateString()} - {new Date(booking.end_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className="text-xs text-gray-500">{booking.vehicle_name}</span>
                  {booking.driver_name && (
                    <span className="text-xs flex items-center gap-1 text-purple-600">
                      <FiUsers className="w-3 h-3" />
                      {booking.driver_name}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[booking.status] || statusColors.planned}`}>
                    {booking.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400">
            <p className="text-sm">No bookings this month</p>
          </div>
        )}
      </div>
    </div>
  );
}
