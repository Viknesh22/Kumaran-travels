import { describe, it, expect } from 'vitest';
import { haversineDistance, calculateRouteSegments } from './geo';

// -----------------------------------------------------------------------
// haversineDistance
// -----------------------------------------------------------------------
describe('haversineDistance', () => {
  it('returns 0 for the same coordinates', () => {
    expect(haversineDistance(10.7905, 78.7047, 10.7905, 78.7047)).toBe(0);
  });

  it('returns a known distance between Trichy and Chennai', () => {
    // Trichy: 10.7905, 78.7047  →  Chennai: 13.0827, 80.2707
    // Approx straight-line distance: ~305 km
    const dist = haversineDistance(10.7905, 78.7047, 13.0827, 80.2707);
    expect(dist).toBeGreaterThan(290);
    expect(dist).toBeLessThan(320);
  });

  it('returns a known distance between Trichy and Madurai', () => {
    // Trichy: 10.7905, 78.7047  →  Madurai: 9.9252, 78.1198
    // Approx straight-line distance: ~116 km
    const dist = haversineDistance(10.7905, 78.7047, 9.9252, 78.1198);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });

  it('returns a sensible distance for a short hop within the same city', () => {
    // Within Trichy city — small distance (< 10 km)
    const dist = haversineDistance(10.7905, 78.7047, 10.8150, 78.6960);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(5);
  });

  it('returns 0 when lat1 is null', () => {
    expect(haversineDistance(null, 78.7, 13.08, 80.27)).toBe(0);
  });

  it('returns 0 when lon1 is null', () => {
    expect(haversineDistance(10.79, null, 13.08, 80.27)).toBe(0);
  });

  it('returns 0 when lat2 is null', () => {
    expect(haversineDistance(10.79, 78.7, null, 80.27)).toBe(0);
  });

  it('returns 0 when lon2 is null', () => {
    expect(haversineDistance(10.79, 78.7, 13.08, null)).toBe(0);
  });

  it('returns 0 when all coordinates are null', () => {
    expect(haversineDistance(null, null, null, null)).toBe(0);
  });

  it('returns 0 when coordinates are undefined', () => {
    expect(haversineDistance(undefined, undefined, undefined, undefined)).toBe(0);
  });

  it('handles negative latitudes / longitudes correctly', () => {
    // Sydney → Melbourne (approx ~715 km)
    const dist = haversineDistance(-33.8688, 151.2093, -37.8136, 144.9631);
    expect(dist).toBeGreaterThan(700);
    expect(dist).toBeLessThan(740);
  });

  it('returns consistent results regardless of coordinate order (symmetry)', () => {
    const a = haversineDistance(10.79, 78.70, 13.08, 80.27);
    const b = haversineDistance(13.08, 80.27, 10.79, 78.70);
    expect(a).toBe(b);
  });

  it('rounds the result to 1 decimal place', () => {
    const dist = haversineDistance(10.7905, 78.7047, 13.0827, 80.2707);
    const decimals = dist.toString().split('.')[1];
    if (decimals) {
      expect(decimals.length).toBeLessThanOrEqual(1);
    }
  });
});

// -----------------------------------------------------------------------
// calculateRouteSegments
// -----------------------------------------------------------------------
describe('calculateRouteSegments', () => {
  it('returns empty segments and total 0 for an empty array', () => {
    const result = calculateRouteSegments([]);
    expect(result.segments).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty segments and total 0 for a single stop', () => {
    const stops = [
      { place_name: 'Trichy', latitude: 10.7905, longitude: 78.7047, stop_order: 0, stop_type: 'start' },
    ];
    const result = calculateRouteSegments(stops);
    expect(result.segments).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty segments and total 0 for stops without coordinates', () => {
    const stops = [
      { place_name: 'Start', latitude: null, longitude: null, stop_order: 0 },
      { place_name: 'End', latitude: null, longitude: null, stop_order: 1 },
    ];
    const result = calculateRouteSegments(stops);
    expect(result.segments).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('calculates a single segment for two stops', () => {
    const stops = [
      { place_name: 'Trichy', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
    ];
    const result = calculateRouteSegments(stops);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].from).toBe('Trichy');
    expect(result.segments[0].to).toBe('Chennai');
    expect(result.segments[0].distance).toBeGreaterThan(290);
    expect(result.segments[0].distance).toBeLessThan(320);
    expect(result.total).toBe(result.segments[0].distance);
  });

  it('calculates multiple segments for multiple stops', () => {
    const stops = [
      { place_name: 'Trichy', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'Madurai', latitude: 9.9252, longitude: 78.1198 },
      { place_name: 'Kanyakumari', latitude: 8.0883, longitude: 77.5385 },
    ];
    const result = calculateRouteSegments(stops);
    expect(result.segments).toHaveLength(2);

    // Trichy → Madurai
    expect(result.segments[0].from).toBe('Trichy');
    expect(result.segments[0].to).toBe('Madurai');
    expect(result.segments[0].distance).toBeGreaterThan(95);

    // Madurai → Kanyakumari
    expect(result.segments[1].from).toBe('Madurai');
    expect(result.segments[1].to).toBe('Kanyakumari');
    expect(result.segments[1].distance).toBeGreaterThan(95);

    // Total should be sum of segments
    expect(result.total).toBeCloseTo(
      result.segments[0].distance + result.segments[1].distance,
      1,
    );
  });

  it('uses fallback names when place_name is missing', () => {
    const stops = [
      { latitude: 10.7905, longitude: 78.7047 },
      { latitude: 13.0827, longitude: 80.2707 },
      { latitude: 9.9252, longitude: 78.1198 },
    ];
    const result = calculateRouteSegments(stops);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].from).toBe('Stop 1');
    expect(result.segments[0].to).toBe('Stop 2');
    expect(result.segments[1].from).toBe('Stop 2');
    expect(result.segments[1].to).toBe('Stop 3');
  });

  it('filters out stops with missing latitude', () => {
    const stops = [
      { place_name: 'Start', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'Mid', latitude: null, longitude: 78.1198 },
      { place_name: 'End', latitude: 8.0883, longitude: 77.5385 },
    ];
    const result = calculateRouteSegments(stops);
    // Only 2 valid stops (Start and End), so 1 segment
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].from).toBe('Start');
    expect(result.segments[0].to).toBe('End');
  });

  it('filters out stops with missing longitude', () => {
    const stops = [
      { place_name: 'Start', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'End', latitude: 8.0883, longitude: null },
    ];
    const result = calculateRouteSegments(stops);
    expect(result.segments).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('handles null/undefined input gracefully', () => {
    expect(calculateRouteSegments(null)).toEqual({ segments: [], total: 0 });
    expect(calculateRouteSegments(undefined)).toEqual({ segments: [], total: 0 });
  });

  it('rounds total distance to 1 decimal place', () => {
    const stops = [
      { place_name: 'A', latitude: 10.7905, longitude: 78.7047 },
      { place_name: 'B', latitude: 13.0827, longitude: 80.2707 },
      { place_name: 'C', latitude: 9.9252, longitude: 78.1198 },
    ];
    const result = calculateRouteSegments(stops);
    const decimals = result.total.toString().split('.')[1];
    if (decimals) {
      expect(decimals.length).toBeLessThanOrEqual(1);
    }
  });
});
