import { spawn } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import {
  createProductionParityLocalEnvironment,
  validateLocalAuthEnvironment,
} from './check-local-auth-env.mjs';

const isolated = process.argv.includes('--isolated');
const environment = isolated
  ? isolatedEnvironment(process.env)
  : createProductionParityLocalEnvironment(process.env);

if (!isolated) {
  const failures = validateLocalAuthEnvironment(environment);
  if (failures.length) {
    console.error('Lodariq local authentication environment is not ready:');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error('\nAdd the missing values to .env.development.local, then run `pnpm dev` again.');
    process.exit(1);
  }
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpmCommand, ['exec', 'turbo', 'run', 'dev', '--env-mode=loose'], {
  env: environment,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  console.error(`Unable to start the local Lodariq services: ${error.message}`);
  process.exitCode = 1;
});

child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});

function isolatedEnvironment(source) {
  const configured = {
    ...source,
    LODARIQ_API_BASE_URL: 'http://127.0.0.1:3001',
    LODARIQ_AUTH_MODE: 'lodariq',
    LODARIQ_EMAIL_DELIVERY_MODE: 'disabled',
    LODARIQ_EXPOSE_DEV_VERIFICATION_TOKEN: 'true',
    LODARIQ_PASSWORD_HASH_MAX_ACTIVE: '1',
    LODARIQ_PASSWORD_HASH_MAX_QUEUED: '8',
    LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS: '2000',
    LODARIQ_PASSWORD_RECOVERY_MODE: 'email',
    LODARIQ_PUBLIC_SIGNUP_MODE: 'email-verification',
  };
  delete configured.DATABASE_URL;
  deleteOperatorOnlyDatabaseValues(configured);
  delete configured.LODARIQ_AUTH_EMAIL_FROM;
  delete configured.LODARIQ_AUTH_EMAIL_TOKEN_SECRET;
  delete configured.RESEND_API_KEY;
  return configured;
}

function deleteOperatorOnlyDatabaseValues(environment) {
  for (const name of [
    'NEON_DB_URL',
    'NEON_OWNER_DATABASE_URL',
    'PRODUCTION_NEON_OWNER_DATABASE_URL',
    'STAGING_NEON_OWNER_DATABASE_URL',
  ]) {
    delete environment[name];
  }
}
