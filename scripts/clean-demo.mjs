#!/usr/bin/env node

/**
 * RescueNet Simulation Demo Cleaner
 * Cleans all simulated clusters, members, and chat messages,
 * returning the system to a clean, live-only state.
 */

async function main() {
  console.log('\n🧹 \x1b[36m[RescueNet Demo Cleaner]\x1b[0m Cleaning simulation data...');
  
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  
  try {
    const res = await fetch(`${apiUrl}/v1/simulation/clean`, {
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

    console.log('\n\x1b[32m✔ SUCCESS: ' + (data.message || 'Demo simulation data wiped cleanly.') + '\x1b[0m');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('• Simulated clusters: Removed');
    console.log('• Simulated survivor nodes: Removed');
    console.log('• Simulated tactical chat: Cleared');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\x1b[36m👉 App and Dashboard are now in clean live-only mode.\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m✖ Failed to connect to API server at ' + apiUrl + ':\x1b[0m', err.message);
    console.log('💡 Tip: Ensure the API server is running (`pnpm --filter @rescuenet/api dev`)\n');
    process.exit(1);
  }
}

main();
