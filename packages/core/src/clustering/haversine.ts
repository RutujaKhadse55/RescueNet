/**
 * Haversine Great-Circle Distance Formulation
 * Calculates distance in meters between two geographic coordinates.
 */

const EARTH_RADIUS_METERS = 6371000; // Mean Earth radius in meters

export interface LatLonPoint {
  latitude: number;
  longitude: number;
}

export function haversineDistanceMeters(p1: LatLonPoint, p2: LatLonPoint): number {
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;

  const lat1Rad = (p1.latitude * Math.PI) / 180;
  const lat2Rad = (p2.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}
