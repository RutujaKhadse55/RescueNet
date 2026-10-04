/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPS_API_KEY?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
