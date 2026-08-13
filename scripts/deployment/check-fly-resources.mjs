import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function checkFlyResources(environment = process.env, runFlyctl = defaultRunFlyctl) {
  if (!environment.FLY_API_TOKEN) {
    throw new Error('The selected GitHub Environment must provide FLY_API_TOKEN.');
  }

  for (const appName of requiredAppNames(environment)) {
    runFlyctl(['status', '--app', appName]);
    const machines = JSON.parse(runFlyctl(['machine', 'list', '--app', appName, '--json']));
    if (!Array.isArray(machines) || machines.length === 0) {
      throw new Error(`Fly app ${appName} must already have at least one Machine.`);
    }
  }
}

function requiredAppNames(environment) {
  return ['EDITOR_APP', 'API_APP', 'DASHBOARD_APP'].map((key) => {
    const value = environment[key];
    if (!value) throw new Error(`${key} is required.`);
    return value;
  });
}

function defaultRunFlyctl(arguments_) {
  const result = spawnSync('flyctl', arguments_, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    throw new Error(`flyctl ${arguments_[0]} failed: ${detail}`);
  }
  return result.stdout;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    checkFlyResources();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
