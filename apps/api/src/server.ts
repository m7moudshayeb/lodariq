import { createApiApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const app = createApiApp({ logger: true });
let stopping = false;

void start();
process.once('SIGTERM', () => void stop('SIGTERM'));
process.once('SIGINT', () => void stop('SIGINT'));

async function start(): Promise<void> {
  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

async function stop(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, 'Shutting down Lodariq API');
  try {
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}
