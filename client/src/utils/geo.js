/**
 * Calculate the Haversine distance between two coordinates in kilometers.
 * Returns 0 if any coordinate is invalid.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Number.isFinite(dist) ? parseFloat(dist.toFixed(1)) : 0;
}

/**
 * Calculate route segment distances from an ordered list of stops.
 * Each stop must have: { latitude, longitude, place_name? }.
 * Stops with missing coordinates are filtered out.
 * Returns { segments: Array<{from, to, distance}>, total: number }
 */
export function calculateRouteSegments(stops = []) {
  if (!stops || !Array.isArray(stops)) return { segments: [], total: 0 };
  const validStops = stops.filter(s => s.latitude != null && s.longitude != null);
  const segments = [];
  let total = 0;

  for (let i = 1; i < validStops.length; i++) {
    const dist = haversineDistance(
      validStops[i - 1].latitude, validStops[i - 1].longitude,
      validStops[i].latitude, validStops[i].longitude
    );
    segments.push({
      from: validStops[i - 1].place_name || `Stop ${i}`,
      to: validStops[i].place_name || `Stop ${i + 1}`,
      distance: dist,
    });
    total += dist;
  }

  return { segments, total: parseFloat(total.toFixed(1)) };
}
