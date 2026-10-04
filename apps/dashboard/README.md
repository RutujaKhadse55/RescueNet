# @rescuenet/dashboard

React 18 + Vite + Leaflet tactical web dashboard for Incident Commanders, National/State Disaster Response Forces (NDRF/SDRF), and field operations coordination.

## Public API & Components

- **`App`**: Main incident command application containing status telemetry, triage hotspot summary, and geospatial Leaflet map pane.
- **`Vite Server`**: Local development server bound to `http://localhost:5173`.

## Failure Modes & Edge Cases

- **Backend Connectivity Loss**: When the Fastify ingestion API is disconnected or unreachable, the dashboard switches to an offline cached view using TanStack Query stale-while-revalidate policies.
- **Tile Server Fallback**: If OpenStreetMap CDN tiles are unreachable due to WAN network dropouts, cached local raster tiles or vector fallback layers prevent black-screen map degradation.
