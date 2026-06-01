/**
 * Geocoding & geolocation helpers for trip stop inputs.
 *
 * All functions are pure (no React state) so they can be unit-tested
 * with simple mocks for fetch / navigator.geolocation.
 *
 * Caching: searchNominatim and reverseGeocode cache results in localStorage
 * with a 24-hour TTL, keyed by the normalized query or coordinate string.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// ---------------------------------------------------------------------------
// localStorage cache helpers
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'kt_geocode_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a deterministic cache key for a free-form search query.
 * Normalises whitespace and lowercases so "Trichy" and "  trichy " hit the same entry.
 */
function searchCacheKey(query) {
  return `${CACHE_PREFIX}search_${query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

/**
 * Generate a cache key for a reverse-geocode coordinate pair (rounded to 4 decimals).
 */
function reverseCacheKey(lat, lon) {
  return `${CACHE_PREFIX}reverse_${parseFloat(lat).toFixed(4)}_${parseFloat(lon).toFixed(4)}`;
}

/**
 * Read a cached entry. Returns `null` if missing or expired.
 */
function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Write an entry to the cache.
 */
function setCache(key, data) {
  try {
    const entry = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable – silently ignore
  }
}

/**
 * Remove all cached geocoding entries from localStorage.
 * Useful for debugging or if the user wants a fresh lookup.
 */
export function clearGeocodingCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search for places matching a query using Nominatim.
 * Results are cached in localStorage for 24 hours.
 * @param {string} query  The place name to search for
 * @param {{ limit?: number, countryCodes?: string }} [options]
 * @returns {Promise<Array<{ display_name: string, lat: string, lon: string, osm_id?: number }>>}
 */
export async function searchNominatim(query, options = {}) {
  const { limit = 5, countryCodes = 'in' } = options;

  if (!query || !query.trim()) return [];

  // Check cache first (only for the default limit=5 to avoid stale low-limit results)
  const cacheKey = searchCacheKey(query);
  if (limit === 5) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }

  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query.trim())}&format=json&limit=${limit}&countrycodes=${countryCodes}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Nominatim search failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const result = Array.isArray(data) ? data : [];

  // Cache full results so the suggestions dropdown is instant on re-type
  if (limit === 5) {
    setCache(cacheKey, result);
  }

  return result;
}

/**
 * Geocode a place name and return the first result, or null if nothing found.
 * This is the core "geocode on blur" logic — no suggestions, just fetch & return.
 * Also cached (via searchNominatim).
 * @param {string} placeName
 * @returns {Promise<{ display_name: string, lat: string, lon: string } | null>}
 */
export async function geocodePlaceName(placeName) {
  if (!placeName || !placeName.trim()) return null;

  const results = await searchNominatim(placeName, { limit: 1 });
  return results.length > 0
    ? { display_name: results[0].display_name, lat: results[0].lat, lon: results[0].lon }
    : null;
}

/**
 * Reverse-geocode a coordinate pair to get a display name.
 * Results are cached in localStorage for 24 hours.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{ display_name: string, lat: string, lon: string }>}
 */
export async function reverseGeocode(latitude, longitude) {
  // Check cache first
  const cacheKey = reverseCacheKey(latitude, longitude);
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${NOMINATIM_BASE}/reverse?lat=${latitude}&lon=${longitude}&format=json`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Reverse geocoding failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (!data || !data.lat || !data.lon) {
    throw new Error('Reverse geocoding returned no results');
  }

  const result = {
    display_name: data.display_name || `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    lat: data.lat,
    lon: data.lon,
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Get the user's current position via the browser Geolocation API.
 * Wraps the callback-based API in a Promise.
 * @param {{ enableHighAccuracy?: boolean, timeout?: number, maximumAge?: number }} [options]
 * @returns {Promise<{ latitude: number, longitude: number }>}
 */
export async function getBrowserLocation(options = {}) {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser');
  }

  const { enableHighAccuracy = true, timeout = 10000, maximumAge = 60000 } = options;

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy,
      timeout,
      maximumAge,
    });
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/**
 * Convenience: get the browser location and reverse-geocode it into a suggestion.
 * The reverse geocode step uses the cache.
 * @param {{ enableHighAccuracy?: boolean, timeout?: number, maximumAge?: number }} [geoOptions]
 * @returns {Promise<{ display_name: string, lat: string, lon: string }>}
 */
export async function getCurrentLocationAsSuggestion(geoOptions = {}) {
  const { latitude, longitude } = await getBrowserLocation(geoOptions);
  return reverseGeocode(latitude, longitude);
}
