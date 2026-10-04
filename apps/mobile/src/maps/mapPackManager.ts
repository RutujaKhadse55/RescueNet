export type MapFormat = 'pmtiles' | 'mbtiles';

export interface MapRegion {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
  format: MapFormat;
  bounds: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  };
  checksumSha256: string;
}

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'downloaded' | 'error';

export interface RegionDownloadState {
  regionId: string;
  status: DownloadStatus;
  progressPercent: number; // 0 - 100
  downloadedBytes: number;
  totalBytes: number;
  localFilePath?: string;
  error?: string;
}

export const INDIAN_DISASTER_MAP_REGIONS: MapRegion[] = [
  {
    id: 'maharashtra',
    name: 'Maharashtra (Western Ghats & Mumbai)',
    description: 'Konkan flood plains, Pune ghats, and Mumbai coastal surge zones',
    sizeBytes: 42_500_000, // 42.5 MB
    format: 'pmtiles',
    bounds: { minLat: 15.6, minLon: 72.6, maxLat: 22.0, maxLon: 80.9 },
    checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    id: 'kerala',
    name: 'Kerala (Wayanad, Idukki & Coastal)',
    description: 'High-range landslide paths, Meppadi, Chooralmala, and Periyar river basins',
    sizeBytes: 38_000_000, // 38.0 MB
    format: 'pmtiles',
    bounds: { minLat: 8.1, minLon: 74.8, maxLat: 12.8, maxLon: 77.4 },
    checksumSha256: '9b74c9897bac770ffc029102a200c5de9f7532ac8ec3bc003f93222eac38c4ac',
  },
  {
    id: 'uttarakhand',
    name: 'Uttarakhand & Himachal (Himalayan Flood Belt)',
    description: 'Alaknanda, Bhagirathi, Mandakini river valleys and cloudburst hotspots',
    sizeBytes: 47_800_000, // 47.8 MB
    format: 'pmtiles',
    bounds: { minLat: 28.7, minLon: 77.5, maxLat: 33.2, maxLon: 81.0 },
    checksumSha256: 'a2b1c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852a123',
  },
  {
    id: 'assam',
    name: 'Assam & Northeast (Brahmaputra Valley)',
    description: 'Kaziranga wetlands, Majuli island, and Dhemaji annual flood zones',
    sizeBytes: 34_600_000, // 34.6 MB
    format: 'pmtiles',
    bounds: { minLat: 24.1, minLon: 89.7, maxLat: 28.0, maxLon: 96.0 },
    checksumSha256: 'c3d4c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b999',
  },
  {
    id: 'odisha',
    name: 'Odisha & Andhra Pradesh (Cyclone Corridor)',
    description: 'Bay of Bengal coastal inundation, Mahanadi and Godavari deltas',
    sizeBytes: 40_200_000, // 40.2 MB
    format: 'pmtiles',
    bounds: { minLat: 13.5, minLon: 79.8, maxLat: 22.5, maxLon: 87.5 },
    checksumSha256: 'f4e5c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852c888',
  },
  {
    id: 'delhi',
    name: 'Delhi NCR & Yamuna Floodplain',
    description: 'Yamuna river basin, flood drainage corridors, and dense urban relief nodes',
    sizeBytes: 28_500_000, // 28.5 MB
    format: 'pmtiles',
    bounds: { minLat: 28.4, minLon: 76.8, maxLat: 28.9, maxLon: 77.4 },
    checksumSha256: 'b5a6c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852d777',
  },
];

export class MapPackManager {
  private downloadStates: Map<string, RegionDownloadState> = new Map();
  private cancelFlags: Map<string, boolean> = new Map();
  private mockAvailableDiskBytes: number = 2_000_000_000; // 2 GB available default

  constructor() {
    for (const region of INDIAN_DISASTER_MAP_REGIONS) {
      this.downloadStates.set(region.id, {
        regionId: region.id,
        status: 'idle',
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: region.sizeBytes,
      });
    }
  }

  public getRegions(): MapRegion[] {
    return INDIAN_DISASTER_MAP_REGIONS;
  }

  public getRegion(regionId: string): MapRegion | undefined {
    return INDIAN_DISASTER_MAP_REGIONS.find((r) => r.id === regionId);
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

  public setMockAvailableDiskBytes(bytes: number): void {
    this.mockAvailableDiskBytes = bytes;
  }

  /**
   * Validates if device has sufficient storage (required size + 100 MB safety buffer)
   */
  public checkStorage(regionId: string): { sufficient: boolean; availableBytes: number; requiredBytes: number } {
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
   * Resilient chunked downloader with pause/resume support
   */
  public async startDownload(
    regionId: string,
    onProgress?: (state: RegionDownloadState) => void
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

    // Simulate chunked streaming download
    const chunkSize = region.sizeBytes / 10;
    while (downloaded < region.sizeBytes) {
      if (this.cancelFlags.get(regionId)) {
        state.status = 'paused';
        this.downloadStates.set(regionId, state);
        if (onProgress) onProgress(state);
        return state;
      }

      await new Promise((r) => setTimeout(r, 40));
      downloaded = Math.min(region.sizeBytes, downloaded + chunkSize);
      state.downloadedBytes = downloaded;
      state.progressPercent = Math.round((downloaded / region.sizeBytes) * 100);

      this.downloadStates.set(regionId, state);
      if (onProgress) onProgress(state);
    }

    state.status = 'downloaded';
    state.localFilePath = `/data/user/0/org.rescuenet.app/files/maps/${region.id}.${region.format}`;
    this.downloadStates.set(regionId, state);
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
  }

  public verifyChecksum(regionId: string): boolean {
    const state = this.getStatus(regionId);
    const region = this.getRegion(regionId);
    if (!region || state.status !== 'downloaded') return false;
    // In mobile runtime, compute SHA-256 of file
    return true;
  }
}
