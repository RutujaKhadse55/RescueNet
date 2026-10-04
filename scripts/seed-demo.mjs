#!/usr/bin/env node

/**
 * RescueNet Simulation Demo Seeder
 * Seeds realistic nearby survivor nodes, emergency disaster cluster,
 * and live NDRF rescue team radio chatting for live demonstrations to judges.
 */

async function main() {
  console.log('\n📡 \x1b[36m[RescueNet Demo Seeder]\x1b[0m Connecting to backend API...');
  
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  
  try {
    const res = await fetch(`${apiUrl}/v1/simulation/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`\x1b[31m✖ Error from API (${res.status}):\x1b[0m`, err);
      process.exit(1);
    }

    const data = await res.json();

    console.log('\n\x1b[32m✔ SUCCESS: Demo Simulation Data Seeded!\x1b[0m');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 \x1b[1mCluster Anchor:\x1b[0m ${data.anchorLocation.lat}° N, ${data.anchorLocation.lon}° E`);
    console.log(`👥 \x1b[1mActive Cluster:\x1b[0m ${data.clusterName} (${data.survivorsCount} survivors)`);
    console.log(`\n📡 \x1b[1mNearby Discovered Mesh Peers:\x1b[0m`);
    data.peers.forEach((p) => {
      const badge = p.triage === 'RED' ? '\x1b[41m RED \x1b[0m' : '\x1b[43m\x1b[30m YELLOW \x1b[0m';
      console.log(`   • ${badge} \x1b[1m${p.name}\x1b[0m — ${p.distanceMeters}m away (RSSI: ${p.rssi} dBm, Bat: ${p.battery}%)`);
      console.log(`     Needs: ${p.needs.join(', ')}`);
      console.log(`     Coordinates: ${p.lat}° N, ${p.lon}° E`);
    });
    console.log(`\n💬 \x1b[1mBLE Survivor Broadcast Messages:\x1b[0m`);
    console.log(`   • ${data.messagesCount} active survivor emergency broadcasts on local mesh.`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\x1b[36m👉 Open your Survivor App and Admin Dashboard to see the live cluster and chat!\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m✖ Failed to connect to API server at ' + apiUrl + ':\x1b[0m', err.message);
    console.log('💡 Tip: Ensure the API server is running (`pnpm --filter @rescuenet/api dev`)\n');
    process.exit(1);
  }
}

main();
