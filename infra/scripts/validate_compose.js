const fs = require('fs');
const path = require('path');

const composePath = path.join(__dirname, '../docker-compose.prod.yml');
const content = fs.readFileSync(composePath, 'utf8');

console.log('Validating docker-compose.prod.yml structure...');
const requiredServices = [
  'db',
  'pgbouncer',
  'api',
  'dashboard',
  'proxy',
  'prometheus',
  'grafana',
  'backup',
];

let missing = [];
for (const s of requiredServices) {
  if (!content.includes(`${s}:`)) {
    missing.push(s);
  }
}

if (missing.length > 0) {
  console.error('Missing services:', missing);
  process.exit(1);
}

console.log('✓ All 8 core production services present in compose file.');
console.log('✓ Validation succeeded.');
