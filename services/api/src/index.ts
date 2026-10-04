import { buildServer } from './server';
import { config } from './config';

async function start() {
  const server = buildServer();

  try {
    const address = await server.listen({
      port: config.PORT,
      host: config.HOST,
    });
    server.log.info(`RescueNet API listening on ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  console.error('Fatal error starting RescueNet API:', err);
  process.exit(1);
});
