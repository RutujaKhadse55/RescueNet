import { MapPackManager, INDIAN_DISASTER_MAP_REGIONS } from '../src/maps/mapPackManager';

describe('Offline Map Pack Manager', () => {
  let mapManager: MapPackManager;

  beforeEach(() => {
    mapManager = new MapPackManager();
  });

  test('contains Indian disaster regions with correct PMTiles metadata', () => {
    const regions = mapManager.getRegions();
    expect(regions.length).toBeGreaterThanOrEqual(6);

    const maharashtra = mapManager.getRegion('maharashtra');
    expect(maharashtra).toBeDefined();
    expect(maharashtra?.format).toBe('pmtiles');
    expect(maharashtra?.bounds.minLat).toBeLessThan(maharashtra!.bounds.maxLat);

    const kerala = mapManager.getRegion('kerala');
    expect(kerala).toBeDefined();
    expect(kerala?.name).toContain('Kerala');
  });

  test('validates storage sufficiency with 100MB safety buffer', () => {
    const region = INDIAN_DISASTER_MAP_REGIONS[0]!;

    // Case 1: Plentiful storage (2 GB)
    mapManager.setMockAvailableDiskBytes(2_000_000_000);
    const checkPlentiful = mapManager.checkStorage(region.id);
    expect(checkPlentiful.sufficient).toBe(true);

    // Case 2: Insufficient storage (only 50 MB, needs region ~42MB + 100MB buffer = 142MB)
    mapManager.setMockAvailableDiskBytes(50_000_000);
    const checkLow = mapManager.checkStorage(region.id);
    expect(checkLow.sufficient).toBe(false);
  });

  test('downloads region pack with progress and marks downloaded', async () => {
    mapManager.setMockAvailableDiskBytes(1_000_000_000);
    const region = INDIAN_DISASTER_MAP_REGIONS[0]!;

    let lastProgress = 0;
    const finalState = await mapManager.startDownload(region.id, (state) => {
      lastProgress = state.progressPercent;
    });

    expect(finalState.status).toBe('downloaded');
    expect(finalState.progressPercent).toBe(100);
    expect(lastProgress).toBe(100);
    expect(mapManager.hasAnyMapDownloaded()).toBe(true);
    expect(mapManager.verifyChecksum(region.id)).toBe(true);
  });

  test('deleting downloaded map resets state to idle', async () => {
    const region = INDIAN_DISASTER_MAP_REGIONS[0]!;
    await mapManager.startDownload(region.id);
    expect(mapManager.getStatus(region.id).status).toBe('downloaded');

    mapManager.deleteMapPack(region.id);
    expect(mapManager.getStatus(region.id).status).toBe('idle');
    expect(mapManager.hasAnyMapDownloaded()).toBe(false);
  });
});
