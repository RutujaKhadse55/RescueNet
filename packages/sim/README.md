# @rescuenet/sim

Node-based discrete-event and mesh propagation simulator for RescueNet, benchmarking protocol performance across 200 to 1,000 concurrent nodes.

## Public API & Exports

- **`SimulationNetwork`**: Class orchestrating nodes, spatial coordinates, BLE ranges, and packet propagation.
- **`SimTopologyConfig`**: Topology configuration parameters (node count, bounding dimensions, loss rates, gateway ratios).
- **`SimNodeConfig`**: Per-node telemetry and role tracking.

## Failure Modes & Edge Cases

- **Island Disconnection**: When node density drops below the percolation threshold, disconnected subgraphs form. The simulator evaluates store-and-forward latency when mobile ferry nodes bridge partitions.
- **Congestion Collisions**: Simulates CSMA/CA airtime collisions when hundreds of nodes broadcast concurrently.
