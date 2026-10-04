import { LocationProvider } from '../src/location/LocationProvider';

describe('Phase 6: Disaster Location Provider & Fallbacks', () => {
  it('acquires high-accuracy GPS fix within timeout', async () => {
    const provider = new LocationProvider();
    const fix = await provider.getCurrentLocation(5000);

    expect(fix.latitude).toBeCloseTo(18.5204, 3);
    expect(fix.longitude).toBeCloseTo(73.8567, 3);
    expect(fix.accuracyMeters).toBeLessThan(10);
    expect(fix.isStaleFallback).toBe(false);
  });

  it('calculates age-inflated accuracy radius during GPS lock failure (rubble/indoor scenario)', () => {
    // 0.5 m/s pedestrian drift rate
    const initialAccuracy = 5.0; // meters
    const ageSeconds = 120; // 2 minutes stale

    const inflated = LocationProvider.calculateAgeInflatedAccuracy(initialAccuracy, ageSeconds);
    // 5.0 + 0.5 * 120 = 65.0 meters
    expect(inflated).toBe(65);
  });

  it('falls back to cached fix with inflated accuracy when GPS query times out', async () => {
    const initialFix = {
      latitude: 19.0760,
      longitude: 72.8777,
      accuracyMeters: 4.0,
      timestamp: Date.now() - 60_000, // 60s ago
    };
    const provider = new LocationProvider(initialFix);

    // Request with 10ms timeout -> triggers failure
    const fallbackFix = await provider.getCurrentLocation(10);

    expect(fallbackFix.latitude).toBe(19.0760);
    expect(fallbackFix.isStaleFallback).toBe(true);
    expect(fallbackFix.accuracyMeters).toBeGreaterThan(4.0);
  });

  it('estimates floor separation accurately from barometric pressure changes', () => {
    const baselineSeaLevelHpa = 1013.25;

    // At ground floor (approx baseline)
    const groundFloor = LocationProvider.estimateFloorFromPressure(1013.25, baselineSeaLevelHpa);
    expect(groundFloor).toBe(0);

    // Elevation decreases pressure by approx 0.36 hPa per floor (approx 3m)
    // 10 floors up = ~30m elevation change = ~1009.6 hPa
    const tenthFloor = LocationProvider.estimateFloorFromPressure(1009.6, baselineSeaLevelHpa);
    expect(tenthFloor).toBe(10);
  });

  it('supports manual pin location override and notes', async () => {
    const provider = new LocationProvider();
    provider.setManualLocationOverride(18.5290, 73.8450, 'Trapped in basement B2');

    const loc = await provider.getCurrentLocation();
    expect(loc.latitude).toBe(18.5290);
    expect(loc.longitude).toBe(73.8450);
    expect(loc.manualNote).toBe('Trapped in basement B2');

    provider.clearManualOverride();
  });
});
