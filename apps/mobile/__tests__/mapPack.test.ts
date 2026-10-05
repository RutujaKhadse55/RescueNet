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
    const finalState = await mapManager.startDownload(region.id, state => {
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

  test('generates World-minus-District mask GeoJSON with polygon hole', () => {
    const region = mapManager.getRegion('maharashtra')!;
    expect(region.districtName).toBe('Pune District');
    expect(region.mbtilesFileName).toBe('pune.mbtiles');
    expect(region.districtPolygon.length).toBeGreaterThan(3);

    const maskGeoJson = MapPackManager.generateWorldMinusDistrictMaskGeoJson(region);
    expect(maskGeoJson.type).toBe('Feature');
    expect(maskGeoJson.geometry.type).toBe('Polygon');
    // Outer ring (world) + inner ring (district hole)
    expect(maskGeoJson.geometry.coordinates.length).toBe(2);
    expect(maskGeoJson.geometry.coordinates[0]).toEqual([
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ]);
  });

  test('generates MapLibre vector style JSON pointing to local mbtiles file', () => {
    const region = mapManager.getRegion('maharashtra')!;
    const styleJsonStr = MapPackManager.generateMapLibreStyle(
      region,
      '/data/user/0/org.rescuenet.app/files/maps/pune.mbtiles',
    );
    const parsed = JSON.parse(styleJsonStr);

    expect(parsed.version).toBe(8);
    expect(parsed.sources.district.url).toBe(
      'mbtiles:///data/user/0/org.rescuenet.app/files/maps/pune.mbtiles',
    );
    expect(parsed.layers.some((l: any) => l.id === 'mask')).toBe(true);
    expect(parsed.layers.some((l: any) => l.id === 'water')).toBe(true);
  });

  test('validates point inside district polygon using ray-casting algorithm', () => {
    const region = mapManager.getRegion('maharashtra')!;
    // Pune center (18.5204° N, 73.8567° E) should be inside
    const isInsidePune = MapPackManager.isPointInDistrict(18.5204, 73.8567, region);
    expect(isInsidePune).toBe(true);

    // Mumbai or distant coordinate (19.076° N, 72.8777° E) should be outside Pune district
    const isOutsidePune = MapPackManager.isPointInDistrict(19.076, 72.8777, region);
    expect(isOutsidePune).toBe(false);
  });
});
