import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-routing-machine';
import { haversineDistance } from '../utils/geo';

// Fix default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function MapRoute({ stops = [], onStopsChange, onRouteFound, editable = false, height = '100%' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routingControlRef = useRef(null);
  const stopsRef = useRef(stops);
  const onStopsChangeRef = useRef(onStopsChange);

  // Keep refs in sync with latest props
  stopsRef.current = stops;
  onStopsChangeRef.current = onStopsChange;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map
    const map = L.map(mapRef.current, {
      center: [10.7905, 78.7047], // Trichy
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Add click handler for adding stops if editable (using refs to avoid stale closures)
    if (editable && onStopsChange) {
      map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        
        // Reverse geocode
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
          const data = await res.json();
          const placeName = data.display_name?.split(',')[0] || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          
          const currentStops = stopsRef.current;
          const newStop = {
            place_name: placeName,
            latitude: lat,
            longitude: lng,
            stop_order: currentStops.length,
            stop_type: 'stop',
          };

          const newStops = [...currentStops, newStop];
          onStopsChangeRef.current?.(newStops);
        } catch (err) {
          console.error('Reverse geocoding failed:', err);
        }
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update route when stops change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove old routing control
    if (routingControlRef.current) {
      map.removeControl(routingControlRef.current);
      routingControlRef.current = null;
    }

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer !== routingControlRef.current) {
        map.removeLayer(layer);
      }
    });

    const validStops = stops.filter(s => s.latitude && s.longitude && s.place_name);

    if (validStops.length < 2) {
      // Show single marker for first stop
      if (validStops.length === 1) {
        const s = validStops[0];
        const color = s.stop_type === 'start' ? 'green' : s.stop_type === 'end' ? 'red' : 'blue';
        L.marker([s.latitude, s.longitude], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style="background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold;white-space:nowrap;">${s.place_name}</div>`,
          }),
        }).addTo(map).bindPopup(`<b>${s.place_name}</b><br>${s.stop_type}`);

        map.setView([s.latitude, s.longitude], 10);
      }
      return;
    }

    // Create waypoints
    const waypoints = validStops.map(s => L.latLng(s.latitude, s.longitude));

    // Use OSRM routing
    routingControlRef.current = L.Routing.control({
      waypoints,
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: 'driving',
      }),
      lineOptions: {
        styles: [{ color: '#3b82f6', opacity: 0.8, weight: 4 }],
        extendToWaypoints: true,
        missingRouteTolerance: 10,
      },
      show: true,
      addWaypoints: editable,
      routeWhileDragging: editable,
      fitSelectedRoutes: true,
      showAlternatives: false,
      autoRoute: true,
      createMarker: (i, wp) => {
        const s = validStops[i];
        const color = s?.stop_type === 'start' ? '#22c55e' : s?.stop_type === 'end' ? '#ef4444' : '#3b82f6';
        const label = s?.place_name || `Stop ${i + 1}`;
        
        return L.marker(wp.latLng, {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style="background:${color};color:white;padding:4px 8px;border-radius:16px;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.2);">${i + 1}. ${label}</div>`,
            iconSize: [label.length * 8, 28],
            iconAnchor: [0, 14],
          }),
        }).bindPopup(`<b>${label}</b><br>${s?.stop_type || 'stop'}`);
      },
    }).addTo(map);

    // Listen for route changes
    routingControlRef.current.on('routesfound', (e) => {
      const routes = e.routes;
      if (routes.length > 0) {
        const route = routes[0];
        const totalDistanceKm = parseFloat((route.summary.totalDistance / 1000).toFixed(1));
        
        // Calculate per-segment distances between waypoints
        const currentStops = stopsRef.current.filter(s => s.latitude && s.longitude);
        const segmentDistances = [];
        for (let i = 1; i < currentStops.length; i++) {
          const dist = haversineDistance(
            currentStops[i - 1].latitude, currentStops[i - 1].longitude,
            currentStops[i].latitude, currentStops[i].longitude
          );
          segmentDistances.push({
            from: currentStops[i - 1].place_name,
            to: currentStops[i].place_name,
            distance: dist,
          });
        }
        
        // Pass distance data back to parent
        if (typeof onRouteFound === 'function') {
          onRouteFound({
            totalDistance: totalDistanceKm,
            segmentDistances,
          });
        }
      }
    });
  }, [stops, editable, onStopsChange, onRouteFound]);

  return <div ref={mapRef} style={{ width: '100%', height }} />;
}
