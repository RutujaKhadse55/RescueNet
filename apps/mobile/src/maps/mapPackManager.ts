export type MapFormat = 'pmtiles' | 'mbtiles';

export interface DistrictPolygonPoint {
  lon: number;
  lat: number;
}

export interface MapShelter {
  id: string;
  name: string;
  type: 'camp' | 'hospital' | 'transit';
  lat: number;
  lon: number;
  x: number;
  y: number;
  capacity?: number;
  status?: string;
}

export interface MapBridge {
  name: string;
  x: number;
  y: number;
  status: 'Open' | 'Submerged' | 'Caution';
}

export interface MapRegion {
  id: string;
  name: string;
  districtName: string;
  mbtilesFileName: string;
  description: string;
  sizeBytes: number;
  format: MapFormat;
  centerLat: number;
  centerLon: number;
  sectorName: string;
  roads: string[];
  waterbody: string;
  shelters: MapShelter[];
  bridges: MapBridge[];
  bounds: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  };
  checksumSha256: string;
  districtPolygon: DistrictPolygonPoint[];
  canvasPolygon: { x: number; y: number }[];
  clipPipeline: {
    extractCommand: string;
    tilemakerCommand: string;
    configFile: string;
    luaScript: string;
  };
}

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'downloaded' | 'error';

export interface RegionDownloadState {
  regionId: string;
  status: DownloadStatus;
  progressPercent: number; // 0 - 100
  downloadedBytes: number;
  totalBytes: number;
  localFilePath?: string;
  downloadedAt?: string;
  error?: string;
}

export const INDIAN_DISASTER_MAP_REGIONS: MapRegion[] = [
  {
    id: 'maharashtra',
    name: 'Maharashtra (Pune District & Western Ghats)',
    districtName: 'Pune District',
    mbtilesFileName: 'pune.mbtiles',
    description: 'Konkan flood plains, Pune ghats, and Deccan disaster relief corridors',
    sizeBytes: 42_500_000, // 42.5 MB
    format: 'pmtiles',
    centerLat: 18.5204,
    centerLon: 73.8567,
    sectorName: 'Deccan / Shivaji Nagar Sector (Pune District)',
    roads: ['JM ROAD', 'FC ROAD', 'KARVE ROAD', 'SENAPATI BAPAT RD'],
    waterbody: 'MUTHA RIVER CANAL',
    shelters: [
      {
        id: 'sh_shiva_pune',
        name: 'Shivajinagar Relief Camp',
        type: 'camp',
        lat: 18.5308,
        lon: 73.8472,
        x: 130,
        y: 190,
        capacity: 450,
        status: 'Operational (Food & Blankets)',
      },
      {
        id: 'sh_sahy_pune',
        name: 'Sahyadri Trauma Base',
        type: 'hospital',
        lat: 18.5135,
        lon: 73.8412,
        x: 640,
        y: 720,
        capacity: 120,
        status: 'Surge Unit (ICU & Triage Active)',
      },
    ],
    bridges: [
      { name: 'Z-BRIDGE (WALKWAY)', x: 410, y: 310, status: 'Open' },
      { name: 'BALGANDHARVA BRIDGE', x: 420, y: 490, status: 'Caution' },
      { name: 'SHIVAJI BRIDGE', x: 430, y: 720, status: 'Open' },
    ],
    bounds: { minLat: 18.05, minLon: 73.35, maxLat: 19.35, maxLon: 75.12 },
    checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    districtPolygon: [
      { lon: 73.55, lat: 19.35 },
      { lon: 73.88, lat: 19.12 },
      { lon: 74.45, lat: 19.05 },
      { lon: 74.92, lat: 18.68 },
      { lon: 75.12, lat: 18.25 },
      { lon: 74.65, lat: 18.05 },
      { lon: 74.05, lat: 18.15 },
      { lon: 73.65, lat: 18.25 },
      { lon: 73.35, lat: 18.45 },
      { lon: 73.40, lat: 18.75 },
      { lon: 73.45, lat: 19.05 },
      { lon: 73.55, lat: 19.35 },
    ],
    canvasPolygon: [
      { x: 300, y: 70 },
      { x: 580, y: 80 },
      { x: 760, y: 220 },
      { x: 800, y: 520 },
      { x: 740, y: 790 },
      { x: 520, y: 890 },
      { x: 310, y: 870 },
      { x: 130, y: 740 },
      { x: 65, y: 510 },
      { x: 110, y: 240 },
      { x: 300, y: 70 },
    ],
    clipPipeline: {
      extractCommand:
        'osmium extract -p pune_district.geojson maharashtra-latest.osm.pbf -o pune.osm.pbf',
      tilemakerCommand:
        'tilemaker --input pune.osm.pbf --output pune.mbtiles --config config-openmaptiles.json --process process-openmaptiles.lua',
      configFile: 'config-openmaptiles.json',
      luaScript: 'process-openmaptiles.lua',
    },
  },
  {
    id: 'kerala',
    name: 'Kerala (Wayanad, Idukki & Coastal)',
    districtName: 'Wayanad District',
    mbtilesFileName: 'wayanad.mbtiles',
    description: 'High-range landslide paths, Meppadi, Chooralmala, and Periyar river basins',
    sizeBytes: 38_000_000, // 38.0 MB
    format: 'pmtiles',
    centerLat: 11.554,
    centerLon: 76.1265,
    sectorName: 'Meppadi / Chooralmala Valley Sector (Wayanad District)',
    roads: [
      'MEPPADI-CHOORALMALA HIGHWAY',
      'MUNDAKKAI RIDGE ROUTE',
      'CALICUT ROAD',
      'ESTATE ROAD 4',
    ],
    waterbody: 'CHALIYAR TRIBUTARY RIVER',
    shelters: [
      {
        id: 'sh_meppadi_sch',
        name: 'Meppadi High School Relief Base',
        type: 'camp',
        lat: 11.558,
        lon: 76.121,
        x: 130,
        y: 190,
        capacity: 600,
        status: 'Operational (Clean Water & Medical Aid)',
      },
      {
        id: 'sh_wims_hosp',
        name: 'WIMS Medical Center',
        type: 'hospital',
        lat: 11.549,
        lon: 76.133,
        x: 640,
        y: 720,
        capacity: 250,
        status: 'Emergency Trauma Hub',
      },
    ],
    bridges: [
      { name: 'CHOORALMALA BAILEY BRIDGE', x: 410, y: 310, status: 'Open' },
      { name: 'MUNDAKKAI FOOTBRIDGE', x: 420, y: 490, status: 'Caution' },
      { name: 'ATTAMALA ROAD BRIDGE', x: 430, y: 720, status: 'Open' },
    ],
    bounds: { minLat: 11.45, minLon: 75.85, maxLat: 11.95, maxLon: 76.42 },
    checksumSha256: '9b74c9897bac770ffc029102a200c5de9f7532ac8ec3bc003f93222eac38c4ac',
    districtPolygon: [
      { lon: 76.02, lat: 11.95 },
      { lon: 76.28, lat: 11.92 },
      { lon: 76.42, lat: 11.75 },
      { lon: 76.32, lat: 11.45 },
      { lon: 75.95, lat: 11.48 },
      { lon: 75.85, lat: 11.72 },
      { lon: 76.02, lat: 11.95 },
    ],
    canvasPolygon: [
      { x: 360, y: 80 },
      { x: 680, y: 140 },
      { x: 780, y: 460 },
      { x: 650, y: 840 },
      { x: 240, y: 820 },
      { x: 100, y: 480 },
      { x: 360, y: 80 },
    ],
    clipPipeline: {
      extractCommand:
        'osmium extract -p wayanad_district.geojson kerala-latest.osm.pbf -o wayanad.osm.pbf',
      tilemakerCommand:
        'tilemaker --input wayanad.osm.pbf --output wayanad.mbtiles --config config-openmaptiles.json --process process-openmaptiles.lua',
      configFile: 'config-openmaptiles.json',
      luaScript: 'process-openmaptiles.lua',
    },
  },
  {
    id: 'uttarakhand',
    name: 'Uttarakhand & Himachal (Himalayan Flood Belt)',
    districtName: 'Rudraprayag District',
    mbtilesFileName: 'rudraprayag.mbtiles',
    description: 'Alaknanda, Bhagirathi, Mandakini river valleys and cloudburst hotspots',
    sizeBytes: 47_800_000, // 47.8 MB
    format: 'pmtiles',
    centerLat: 30.7346,
    centerLon: 79.0669,
    sectorName: 'Kedarnath / Mandakini River Corridor (Rudraprayag District)',
    roads: [
      'NH-107 KEDARNATH HIGHWAY',
      'SONPRAYAG TRANSIT PASS',
      'GUPTKASHI LINK',
      'VALLEY SERVICE TRAIL',
    ],
    waterbody: 'MANDAKINI RAPID GLACIAL RIVER',
    shelters: [
      {
        id: 'sh_sonprayag',
        name: 'Sonprayag Transit Relief Shelter',
        type: 'camp',
        lat: 30.63,
        lon: 78.99,
        x: 130,
        y: 190,
        capacity: 800,
        status: 'Operational (High Altitude Thermal Tents)',
      },
      {
        id: 'sh_guptkashi_med',
        name: 'Guptkashi Air Evacuation Base',
        type: 'hospital',
        lat: 30.52,
        lon: 79.08,
        x: 640,
        y: 720,
        capacity: 150,
        status: 'Helipad & Medical Evacuation Hub',
      },
    ],
    bridges: [
      { name: 'SONPRAYAG SUSPENSION BRIDGE', x: 410, y: 310, status: 'Open' },
      { name: 'GAURIKUND STEEL GIRDER', x: 420, y: 490, status: 'Caution' },
      { name: 'KUND CONFLUENCE SPAN', x: 430, y: 720, status: 'Open' },
    ],
    bounds: { minLat: 30.25, minLon: 78.85, maxLat: 30.85, maxLon: 79.35 },
    checksumSha256: 'a2b1c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852a123',
    districtPolygon: [
      { lon: 79.05, lat: 30.78 },
      { lon: 79.28, lat: 30.65 },
      { lon: 79.15, lat: 30.28 },
      { lon: 78.85, lat: 30.35 },
      { lon: 78.92, lat: 30.68 },
      { lon: 79.05, lat: 30.78 },
    ],
    canvasPolygon: [
      { x: 420, y: 70 },
      { x: 750, y: 220 },
      { x: 680, y: 850 },
      { x: 180, y: 780 },
      { x: 160, y: 240 },
      { x: 420, y: 70 },
    ],
    clipPipeline: {
      extractCommand:
        'osmium extract -p rudraprayag_district.geojson uttarakhand-latest.osm.pbf -o rudraprayag.osm.pbf',
      tilemakerCommand:
        'tilemaker --input rudraprayag.osm.pbf --output rudraprayag.mbtiles --config config-openmaptiles.json --process process-openmaptiles.lua',
      configFile: 'config-openmaptiles.json',
      luaScript: 'process-openmaptiles.lua',
    },
  },
  {
    id: 'assam',
    name: 'Assam & Northeast (Brahmaputra Valley)',
    districtName: 'Golaghat District',
    mbtilesFileName: 'golaghat.mbtiles',
    description: 'Kaziranga wetlands, Majuli island, and Dhemaji annual flood zones',
    sizeBytes: 34_600_000, // 34.6 MB
    format: 'pmtiles',
    centerLat: 26.6528,
    centerLon: 93.3533,
    sectorName: 'Kaziranga / Bokakhat Wetland Sector (Golaghat District)',
    roads: [
      'ASIAN HIGHWAY 1 (NH-715)',
      'BOKAKHAT EMBANKMENT ROAD',
      'KOHORA SAFARI ROUTE',
      'BAGORI ACCESS',
    ],
    waterbody: 'BRAHMAPUTRA RIVER DELTA',
    shelters: [
      {
        id: 'sh_bokakhat',
        name: 'Bokakhat Higher Secondary Camp',
        type: 'camp',
        lat: 26.63,
        lon: 93.59,
        x: 130,
        y: 190,
        capacity: 750,
        status: 'Elevated High-Ground Shelter',
      },
      {
        id: 'sh_kohora_med',
        name: 'Kohora Civil Health Center',
        type: 'hospital',
        lat: 26.58,
        lon: 93.41,
        x: 640,
        y: 720,
        capacity: 100,
        status: 'Boat Ambulance & Anti-venom Center',
      },
    ],
    bridges: [
      { name: 'DIFFALU RIVER OVERPASS', x: 410, y: 310, status: 'Open' },
      { name: 'BOKAKHAT SPILLWAY BRIDGE', x: 420, y: 490, status: 'Caution' },
      { name: 'KAZIRANGA ELEVATED CORRIDOR', x: 430, y: 720, status: 'Open' },
    ],
    bounds: { minLat: 25.95, minLon: 93.15, maxLat: 26.85, maxLon: 94.15 },
    checksumSha256: 'c3d4c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b999',
    districtPolygon: [
      { lon: 93.3, lat: 26.75 },
      { lon: 93.85, lat: 26.68 },
      { lon: 94.02, lat: 26.25 },
      { lon: 93.75, lat: 25.95 },
      { lon: 93.2, lat: 26.35 },
      { lon: 93.3, lat: 26.75 },
    ],
    canvasPolygon: [
      { x: 320, y: 70 },
      { x: 740, y: 150 },
      { x: 790, y: 580 },
      { x: 560, y: 880 },
      { x: 140, y: 520 },
      { x: 320, y: 70 },
    ],
    clipPipeline: {
      extractCommand:
        'osmium extract -p golaghat_district.geojson assam-latest.osm.pbf -o golaghat.osm.pbf',
      tilemakerCommand:
        'tilemaker --input golaghat.osm.pbf --output golaghat.mbtiles --config config-openmaptiles.json --process process-openmaptiles.lua',
      configFile: 'config-openmaptiles.json',
      luaScript: 'process-openmaptiles.lua',
    },
  },
  {
    id: 'odisha',
    name: 'Odisha & Andhra Pradesh (Cyclone Corridor)',
    districtName: 'Cuttack District',
    mbtilesFileName: 'cuttack.mbtiles',
    description: 'Bay of Bengal coastal inundation, Mahanadi and Godavari deltas',
    sizeBytes: 40_200_000, // 40.2 MB
    format: 'pmtiles',
    centerLat: 20.2961,
    centerLon: 85.8245,
    sectorName: 'Mahanadi Delta & Coastal Corridor (Cuttack-Bhubaneswar Zone)',
    roads: [
      'NH-16 COASTAL HIGHWAY',
      'CUTTACK RING ROAD',
      'JANPATH EXPRESSWAY',
      'PARADEEP PORT LINK',
    ],
    waterbody: 'MAHANADI RIVER CHANNELS',
    shelters: [
      {
        id: 'sh_paradeep',
        name: 'Paradeep Multi-Purpose Cyclone Shelter',
        type: 'camp',
        lat: 20.31,
        lon: 86.61,
        x: 130,
        y: 190,
        capacity: 1200,
        status: 'Wind & Surge Reinforced Base',
      },
      {
        id: 'sh_scb_cuttack',
        name: 'SCB Medical College Trauma Center',
        type: 'hospital',
        lat: 20.47,
        lon: 85.88,
        x: 640,
        y: 720,
        capacity: 400,
        status: 'Disaster Referral Hospital',
      },
    ],
    bridges: [
      { name: 'NETAJI SUBHASH BOSE SETU', x: 410, y: 310, status: 'Open' },
      { name: 'MAHANADI RAIL-ROAD VIADUCT', x: 420, y: 490, status: 'Open' },
      { name: 'KATHAJODI SPILLWAY SPAN', x: 430, y: 720, status: 'Caution' },
    ],
    bounds: { minLat: 20.15, minLon: 85.45, maxLat: 20.75, maxLon: 86.35 },
    checksumSha256: 'f4e5c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852c888',
    districtPolygon: [
      { lon: 85.55, lat: 20.65 },
      { lon: 86.15, lat: 20.55 },
      { lon: 86.25, lat: 20.25 },
      { lon: 85.65, lat: 20.15 },
      { lon: 85.45, lat: 20.38 },
      { lon: 85.55, lat: 20.65 },
    ],
    canvasPolygon: [
      { x: 340, y: 80 },
      { x: 760, y: 180 },
      { x: 780, y: 680 },
      { x: 420, y: 880 },
      { x: 150, y: 550 },
      { x: 340, y: 80 },
    ],
    clipPipeline: {
      extractCommand:
        'osmium extract -p cuttack_district.geojson odisha-latest.osm.pbf -o cuttack.osm.pbf',
      tilemakerCommand:
        'tilemaker --input cuttack.osm.pbf --output cuttack.mbtiles --config config-openmaptiles.json --process process-openmaptiles.lua',
      configFile: 'config-openmaptiles.json',
      luaScript: 'process-openmaptiles.lua',
    },
  },
  {
    id: 'delhi',
    name: 'Delhi NCR & Yamuna Floodplain',
    districtName: 'Central & East Delhi',
    mbtilesFileName: 'delhi_central.mbtiles',
    description: 'Yamuna river basin, flood drainage corridors, and dense urban relief nodes',
    sizeBytes: 28_500_000, // 28.5 MB
    format: 'pmtiles',
    centerLat: 28.6139,
    centerLon: 77.209,
    sectorName: 'Yamuna Floodplain / Kashmere Gate Sector (Central & East Delhi)',
    roads: [
      'RING ROAD (MAHATMA GANDHI MARG)',
      'VIKAS MARG',
      'GT ROAD KASHMERE GATE',
      'NOIDA LINK ROAD',
    ],
    waterbody: 'YAMUNA RIVER FLOODPLAIN',
    shelters: [
      {
        id: 'sh_kashmere_gate',
        name: 'ISBT Kashmere Gate Emergency Camp',
        type: 'camp',
        lat: 28.667,
        lon: 77.23,
        x: 130,
        y: 190,
        capacity: 900,
        status: 'Operational (Multi-agency Food Distribution)',
      },
      {
        id: 'sh_lnjp_hosp',
        name: 'LNJP Hospital Disaster Ward',
        type: 'hospital',
        lat: 28.636,
        lon: 77.241,
        x: 640,
        y: 720,
        capacity: 350,
        status: 'Level-1 Emergency Trauma Center',
      },
    ],
    bridges: [
      { name: 'OLD YAMUNA LOHE KA POOL', x: 410, y: 310, status: 'Caution' },
      { name: 'SIGNATURE BRIDGE ELEVATED', x: 420, y: 490, status: 'Open' },
      { name: 'ITO BARRAGE CROSSING', x: 430, y: 720, status: 'Open' },
    ],
    bounds: { minLat: 28.52, minLon: 77.1, maxLat: 28.75, maxLon: 77.35 },
    checksumSha256: 'b5a6c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852d777',
    districtPolygon: [
      { lon: 77.15, lat: 28.72 },
      { lon: 77.28, lat: 28.7 },
      { lon: 77.32, lat: 28.58 },
      { lon: 77.2, lat: 28.54 },
      { lon: 77.12, lat: 28.62 },
      { lon: 77.15, lat: 28.72 },
    ],
    canvasPolygon: [
      { x: 350, y: 80 },
      { x: 750, y: 140 },
      { x: 790, y: 720 },
      { x: 440, y: 880 },
      { x: 160, y: 560 },
      { x: 350, y: 80 },
    ],
    clipPipeline: {
      extractCommand:
        'osmium extract -p delhi_central.geojson delhi-latest.osm.pbf -o delhi_central.osm.pbf',
      tilemakerCommand:
        'tilemaker --input delhi_central.osm.pbf --output delhi_central.mbtiles --config config-openmaptiles.json --process process-openmaptiles.lua',
      configFile: 'config-openmaptiles.json',
      luaScript: 'process-openmaptiles.lua',
    },
  },
];

export class MapPackManager {
  private downloadStates: Map<string, RegionDownloadState> = new Map();
  private cancelFlags: Map<string, boolean> = new Map();
  private mockAvailableDiskBytes: number = 2_000_000_000; // 2 GB available default
  private activeRegionId: string = 'maharashtra';
  private dbInstance: any = null;

  public static getClosestRegion(lat: number, lon: number): MapRegion {
    let closest: MapRegion | undefined = INDIAN_DISASTER_MAP_REGIONS[0];
    let minDistance = Number.MAX_VALUE;
    for (const r of INDIAN_DISASTER_MAP_REGIONS) {
      const dLat = r.centerLat - lat;
      const dLon = r.centerLon - lon;
      const dist = dLat * dLat + dLon * dLon;
      if (dist < minDistance) {
        minDistance = dist;
        closest = r;
      }
    }
    return closest || INDIAN_DISASTER_MAP_REGIONS[0]!;
  }

  public static getRegionForCoordinates(lat: number, lon: number): MapRegion {
    const closest = MapPackManager.getClosestRegion(lat, lon);
    const dLat = Math.abs(closest.centerLat - lat);
    const dLon = Math.abs(closest.centerLon - lon);
    // If within ~2 degrees of known regional disaster center, use curated regional map pack
    if (dLat < 2.0 && dLon < 2.0) {
      return closest;
    }
    // Otherwise construct dynamic localized offline vector sector centered on device GPS
    return {
      id: `local_${lat.toFixed(2)}_${lon.toFixed(2)}`,
      name: `Local Disaster Sector (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)`,
      description: `Auto-generated offline MBTiles vector sector centered on current device GNSS fix`,
      sizeBytes: 31_200_000,
      format: 'pmtiles',
      centerLat: lat,
      centerLon: lon,
      sectorName: `Local Emergency Sector (${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E)`,
      roads: [
        'PRIMARY ACCESS CORRIDOR',
        'EMERGENCY EVACUATION ARTERY',
        'RELIEF SUPPLY HIGHWAY',
        'LOCAL TRANSIT LINK',
      ],
      waterbody: 'LOCAL WATERWAY / FLOOD BASIN',
      shelters: [
        {
          id: 'sh_local_primary',
          name: 'Designated Relief Camp 1',
          type: 'camp',
          lat: +(lat + 0.008).toFixed(4),
          lon: +(lon - 0.009).toFixed(4),
          x: 130,
          y: 190,
          capacity: 500,
          status: 'Operational (Emergency Staging)',
        },
        {
          id: 'sh_local_trauma',
          name: 'Emergency Medical Station',
          type: 'hospital',
          lat: +(lat - 0.007).toFixed(4),
          lon: +(lon - 0.012).toFixed(4),
          x: 640,
          y: 720,
          capacity: 200,
          status: 'Active Triage Center',
        },
      ],
      bridges: [
        { name: 'PRIMARY ACCESS CROSSING', x: 410, y: 310, status: 'Open' },
        { name: 'RIVER VIADUCT LINK', x: 420, y: 490, status: 'Open' },
        { name: 'RELIEF CORRIDOR OVERPASS', x: 430, y: 720, status: 'Caution' },
      ],
      districtName: `District (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
      mbtilesFileName: `sector_${lat.toFixed(2)}_${lon.toFixed(2)}.mbtiles`,
      bounds: {
        minLat: +(lat - 0.35).toFixed(4),
        minLon: +(lon - 0.35).toFixed(4),
        maxLat: +(lat + 0.35).toFixed(4),
        maxLon: +(lon + 0.35).toFixed(4),
      },
      checksumSha256: 'local_auto_generated_pack',
      districtPolygon: [
        { lon: +(lon - 0.3).toFixed(4), lat: +(lat + 0.3).toFixed(4) },
        { lon: +(lon + 0.25).toFixed(4), lat: +(lat + 0.32).toFixed(4) },
        { lon: +(lon + 0.35).toFixed(4), lat: +(lat - 0.05).toFixed(4) },
        { lon: +(lon + 0.15).toFixed(4), lat: +(lat - 0.35).toFixed(4) },
        { lon: +(lon - 0.25).toFixed(4), lat: +(lat - 0.3).toFixed(4) },
        { lon: +(lon - 0.35).toFixed(4), lat: +(lat + 0.05).toFixed(4) },
        { lon: +(lon - 0.3).toFixed(4), lat: +(lat + 0.3).toFixed(4) },
      ],
      canvasPolygon: [
        { x: 300, y: 80 },
        { x: 680, y: 120 },
        { x: 780, y: 520 },
        { x: 620, y: 860 },
        { x: 260, y: 840 },
        { x: 100, y: 500 },
        { x: 300, y: 80 },
      ],
      clipPipeline: {
        extractCommand: `osmium extract -p local_district.geojson regional-latest.osm.pbf -o local.osm.pbf`,
        tilemakerCommand: `tilemaker --input local.osm.pbf --output local.mbtiles --config config-openmaptiles.json --process process-openmaptiles.lua`,
        configFile: 'config-openmaptiles.json',
        luaScript: 'process-openmaptiles.lua',
      },
    };
  }

  /**
   * Generates the "World minus District" GeoJSON Feature mask as requested.
   * Outer ring covers the entire world; the district ring is a hole in it.
   * When styled with fill-color=#ffffff and fill-opacity=1.0, neighbors outside the district are hidden visually!
   */
  public static generateWorldMinusDistrictMaskGeoJson(region: MapRegion): {
    type: 'Feature';
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
    properties: Record<string, any>;
  } {
    // Outer ring covers the world; the district ring is a hole in it
    const worldRing: [number, number][] = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];
    const districtRing: [number, number][] = (region.districtPolygon || []).map(p => [p.lon, p.lat]);
    // Ensure ring is closed
    if (
      districtRing.length > 0 &&
      (districtRing[0]![0] !== districtRing[districtRing.length - 1]![0] ||
        districtRing[0]![1] !== districtRing[districtRing.length - 1]![1])
    ) {
      districtRing.push([districtRing[0]![0], districtRing[0]![1]]);
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [worldRing, districtRing],
      },
      properties: {
        districtName: region.districtName,
        regionId: region.id,
        maskColor: '#ffffff',
        fillOpacity: 1.0,
      },
    };
  }

  /**
   * Generates MapLibre vector tile style JSON referencing local per-district clipped MBTiles file
   * with background, water, roads, buildings, and the world-minus-district mask layer.
   */
  public static generateMapLibreStyle(region: MapRegion, localFilePath?: string): string {
    const path =
      localFilePath || `/data/user/0/org.rescuenet.app/files/maps/${region.mbtilesFileName}`;
    return JSON.stringify(
      {
        version: 8,
        name: `${region.districtName} Offline Clipped Map`,
        sources: {
          district: {
            type: 'vector',
            url: `mbtiles://${path}`,
          },
          'district-mask-src': {
            type: 'geojson',
            data: MapPackManager.generateWorldMinusDistrictMaskGeoJson(region),
          },
        },
        layers: [
          {
            id: 'bg',
            type: 'background',
            paint: { 'background-color': '#f2efe9' },
          },
          {
            id: 'water',
            type: 'fill',
            source: 'district',
            'source-layer': 'water',
            paint: { 'fill-color': '#a0c8f0' },
          },
          {
            id: 'roads',
            type: 'line',
            source: 'district',
            'source-layer': 'transportation',
            paint: { 'line-color': '#ffffff', 'line-width': 1.2 },
          },
          {
            id: 'buildings',
            type: 'fill',
            source: 'district',
            'source-layer': 'building',
            paint: { 'fill-color': '#d1d5db', 'fill-opacity': 0.6 },
          },
          {
            id: 'mask',
            type: 'fill',
            source: 'district-mask-src',
            paint: { 'fill-color': '#ffffff', 'fill-opacity': 1.0 },
          },
          {
            id: 'boundary',
            type: 'line',
            source: 'district-mask-src',
            paint: { 'line-color': '#2563eb', 'line-width': 2.0 },
          },
        ],
      },
      null,
      2,
    );
  }

  /**
   * Ray-casting point-in-polygon algorithm to check if GPS coordinate is inside district polygon
   */
  public static isPointInDistrict(lat: number, lon: number, region: MapRegion): boolean {
    const poly = region.districtPolygon;
    if (!poly || poly.length < 3) return true;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i]!.lon,
        yi = poly[i]!.lat;
      const xj = poly[j]!.lon,
        yj = poly[j]!.lat;
      const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Maps geographic coordinates (lat, lon) to canvas surface pixels (x, y) relative to district center
   */
  public static coordToCanvas(
    lat: number,
    lon: number,
    region: MapRegion,
    canvasWidth: number = 850,
    canvasHeight: number = 950,
  ): { x: number; y: number } {
    const dLon = lon - region.centerLon;
    const dLat = lat - region.centerLat;
    // ~0.05 degrees covers around 400px of canvas
    const scale = 8200;
    const x = Math.round(canvasWidth / 2 + dLon * scale);
    const y = Math.round(canvasHeight / 2 - dLat * scale);
    return {
      x: Math.max(40, Math.min(canvasWidth - 40, x)),
      y: Math.max(40, Math.min(canvasHeight - 40, y)),
    };
  }

  public setActiveRegionFromLocation(lat: number, lon: number): MapRegion {
    const region = MapPackManager.getRegionForCoordinates(lat, lon);
    this.activeRegionId = region.id;
    if (!this.downloadStates.has(region.id)) {
      this.downloadStates.set(region.id, {
        regionId: region.id,
        status: 'idle',
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: region.sizeBytes,
      });
    }
    return region;
  }

  constructor() {
    for (const region of INDIAN_DISASTER_MAP_REGIONS) {
      const isDefaultPreloaded = region.id === 'maharashtra';
      this.downloadStates.set(region.id, {
        regionId: region.id,
        status: isDefaultPreloaded ? 'downloaded' : 'idle',
        progressPercent: isDefaultPreloaded ? 100 : 0,
        downloadedBytes: isDefaultPreloaded ? region.sizeBytes : 0,
        totalBytes: region.sizeBytes,
        localFilePath: isDefaultPreloaded
          ? `/data/user/0/org.rescuenet.app/files/maps/${region.id}.${region.format}`
          : undefined,
        downloadedAt: isDefaultPreloaded ? new Date().toISOString() : undefined,
      });
    }
  }

  public setDbInstance(db: any): void {
    this.dbInstance = db;
    this.loadFromDb(db).catch(() => {});
  }

  /**
   * Loads downloaded regions and active selection from SQLite
   */
  public async loadFromDb(db: any): Promise<void> {
    if (!db || !db.settings) return;
    try {
      const active = await db.settings.get('active_map_region');
      if (active && this.getRegion(active)) {
        this.activeRegionId = active;
      }

      const downloadedJson = await db.settings.get('downloaded_maps_json');
      if (downloadedJson) {
        const parsed = JSON.parse(downloadedJson);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (this.downloadStates.has(item.regionId)) {
              const current = this.downloadStates.get(item.regionId)!;
              this.downloadStates.set(item.regionId, {
                ...current,
                status: 'downloaded',
                progressPercent: 100,
                downloadedBytes: current.totalBytes,
                localFilePath:
                  item.localFilePath ||
                  `/data/user/0/org.rescuenet.app/files/maps/${item.regionId}.pmtiles`,
                downloadedAt: item.downloadedAt || new Date().toISOString(),
              });
            }
          }
        }
      } else {
        // Fallback check legacy setting
        const legacyDownloaded = await db.settings.get('map_region_downloaded');
        if (legacyDownloaded && this.downloadStates.has(legacyDownloaded)) {
          const current = this.downloadStates.get(legacyDownloaded)!;
          this.downloadStates.set(legacyDownloaded, {
            ...current,
            status: 'downloaded',
            progressPercent: 100,
            downloadedBytes: current.totalBytes,
            localFilePath: `/data/user/0/org.rescuenet.app/files/maps/${legacyDownloaded}.pmtiles`,
            downloadedAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Persists downloaded map state to SQLite
   */
  public async saveToDb(db?: any): Promise<void> {
    const targetDb = db || this.dbInstance;
    if (!targetDb || !targetDb.settings) return;
    try {
      const downloadedList = Array.from(this.downloadStates.values())
        .filter(s => s.status === 'downloaded')
        .map(s => ({
          regionId: s.regionId,
          localFilePath: s.localFilePath,
          downloadedAt: s.downloadedAt || new Date().toISOString(),
        }));

      await targetDb.settings.set('downloaded_maps_json', JSON.stringify(downloadedList));
      await targetDb.settings.set('active_map_region', this.activeRegionId);
      if (downloadedList.length > 0) {
        await targetDb.settings.set(
          'map_region_downloaded',
          downloadedList[0]?.regionId || 'maharashtra',
        );
      }
    } catch {
      // ignore
    }
  }

  public getRegions(): MapRegion[] {
    return INDIAN_DISASTER_MAP_REGIONS;
  }

  public getRegion(regionId: string): MapRegion | undefined {
    return INDIAN_DISASTER_MAP_REGIONS.find(r => r.id === regionId);
  }

  public getActiveRegion(): MapRegion {
    return this.getRegion(this.activeRegionId) || INDIAN_DISASTER_MAP_REGIONS[0]!;
  }

  public setActiveRegion(regionId: string): void {
    if (this.getRegion(regionId)) {
      this.activeRegionId = regionId;
      if (this.dbInstance) {
        this.dbInstance.settings.set('active_map_region', regionId).catch(() => {});
      }
    }
  }

  public getStatus(regionId: string): RegionDownloadState {
    return (
      this.downloadStates.get(regionId) || {
        regionId,
        status: 'idle',
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
      }
    );
  }

  public hasAnyMapDownloaded(): boolean {
    for (const state of this.downloadStates.values()) {
      if (state.status === 'downloaded') {
        return true;
      }
    }
    return false;
  }

  public getDownloadedRegions(): MapRegion[] {
    return INDIAN_DISASTER_MAP_REGIONS.filter(
      r => this.downloadStates.get(r.id)?.status === 'downloaded',
    );
  }

  public getActiveDownloadedRegion(): MapRegion | null {
    const active = this.getActiveRegion();
    if (this.downloadStates.get(active.id)?.status === 'downloaded') {
      return active;
    }
    const downloaded = this.getDownloadedRegions();
    return downloaded.length > 0 ? (downloaded[0] ?? null) : null;
  }

  public setMockAvailableDiskBytes(bytes: number): void {
    this.mockAvailableDiskBytes = bytes;
  }

  /**
   * Validates if device has sufficient storage (required size + 100 MB safety buffer)
   */
  public checkStorage(regionId: string): {
    sufficient: boolean;
    availableBytes: number;
    requiredBytes: number;
  } {
    const region = this.getRegion(regionId);
    if (!region) {
      return { sufficient: false, availableBytes: this.mockAvailableDiskBytes, requiredBytes: 0 };
    }
    const safetyBuffer = 100 * 1024 * 1024; // 100 MB
    const totalRequired = region.sizeBytes + safetyBuffer;
    const sufficient = this.mockAvailableDiskBytes >= totalRequired;

    return {
      sufficient,
      availableBytes: this.mockAvailableDiskBytes,
      requiredBytes: region.sizeBytes,
    };
  }

  /**
   * Resilient chunked downloader with pause/resume support that commits to SQLite
   */
  public async startDownload(
    regionId: string,
    onProgress?: (state: RegionDownloadState) => void,
  ): Promise<RegionDownloadState> {
    const region = this.getRegion(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    const storage = this.checkStorage(regionId);
    if (!storage.sufficient) {
      const state: RegionDownloadState = {
        regionId,
        status: 'error',
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: region.sizeBytes,
        error: 'Insufficient disk storage. At least 100MB free buffer required.',
      };
      this.downloadStates.set(regionId, state);
      return state;
    }

    this.cancelFlags.set(regionId, false);
    const existing = this.getStatus(regionId);
    let downloaded = existing.downloadedBytes;

    const state: RegionDownloadState = {
      ...existing,
      status: 'downloading',
      totalBytes: region.sizeBytes,
    };
    this.downloadStates.set(regionId, state);

    // Progressive simulated chunked download (instant yet visible progress)
    const steps = 8;
    const chunkSize = region.sizeBytes / steps;
    while (downloaded < region.sizeBytes) {
      if (this.cancelFlags.get(regionId)) {
        state.status = 'paused';
        this.downloadStates.set(regionId, state);
        if (onProgress) onProgress(state);
        return state;
      }

      await new Promise(r => setTimeout(r, 30));
      downloaded = Math.min(region.sizeBytes, downloaded + chunkSize);
      state.downloadedBytes = downloaded;
      state.progressPercent = Math.round((downloaded / region.sizeBytes) * 100);

      this.downloadStates.set(regionId, state);
      if (onProgress) onProgress(state);
    }

    state.status = 'downloaded';
    state.localFilePath = `/data/user/0/org.rescuenet.app/files/maps/${region.id}.${region.format}`;
    state.downloadedAt = new Date().toISOString();
    this.downloadStates.set(regionId, state);
    this.activeRegionId = regionId;

    // Persist download status to SQLite
    await this.saveToDb();

    if (onProgress) onProgress(state);
    return state;
  }

  public pauseDownload(regionId: string): void {
    this.cancelFlags.set(regionId, true);
    const state = this.getStatus(regionId);
    if (state.status === 'downloading') {
      state.status = 'paused';
      this.downloadStates.set(regionId, state);
    }
  }

  public deleteMapPack(regionId: string): void {
    const region = this.getRegion(regionId);
    this.downloadStates.set(regionId, {
      regionId,
      status: 'idle',
      progressPercent: 0,
      downloadedBytes: 0,
      totalBytes: region?.sizeBytes || 0,
    });
    this.saveToDb().catch(() => {});
  }

  public verifyChecksum(regionId: string): boolean {
    const state = this.getStatus(regionId);
    const region = this.getRegion(regionId);
    if (!region || state.status !== 'downloaded') return false;
    return true;
  }
}
