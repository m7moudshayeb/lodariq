import console from 'node:console';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { getFlyTarget } from './fly-targets.mjs';

const PRODUCTION_CONFIRMATION = 'DEPLOY PRODUCTION';

export function validateDeploymentRequest({
  eventName,
  refName,
  targetName,
  buildVerified,
  productionConfirmation,
}) {
  getFlyTarget(targetName);

  if (buildVerified) {
    if (eventName !== 'push' || refName !== 'master' || targetName !== 'development') {
      throw new Error('Automatic Development deployment requires a successful master build.');
    }
  } else if (eventName !== 'workflow_dispatch') {
    throw new Error('Unverified deployments must be started manually.');
  }

  if (targetName === 'development') {
    requireBlankConfirmation(productionConfirmation, 'Development');
    return;
  }

  if (refName !== 'master') {
    throw new Error(`${capitalize(targetName)} requires a manual dispatch from master.`);
  }

  if (targetName === 'staging') {
    requireBlankConfirmation(productionConfirmation, 'Staging');
    return;
  }

  if (productionConfirmation !== PRODUCTION_CONFIRMATION) {
    throw new Error('Production requires the exact confirmation phrase.');
  }
}

export function validateTargetConfigs(target, rootDirectory = process.cwd()) {
  for (const surface of ['editor', 'api', 'dashboard']) {
    const expectedApp = target[`${surface}_app`];
    const configPath = target[`${surface}_config`];
    const source = readFileSync(resolve(rootDirectory, configPath), 'utf8');
    const configuredApps = [...source.matchAll(/^app = "([^"]+)"$/gmu)].map((match) => match[1]);

    if (configuredApps.length !== 1 || configuredApps[0] !== expectedApp) {
      throw new Error(`${configPath} does not select the expected existing app ${expectedApp}.`);
    }
  }
}

export function deploymentOutputs(targetName) {
  return { target: targetName, ...getFlyTarget(targetName) };
}

export function prepareFlyDeployment(environment = process.env) {
  const buildVerified = parseBoolean(environment.BUILD_VERIFIED);
  const targetName = environment.REQUESTED_TARGET ?? '';

  validateDeploymentRequest({
    eventName: environment.GITHUB_EVENT_NAME ?? '',
    refName: environment.GITHUB_REF_NAME ?? '',
    targetName,
    buildVerified,
    productionConfirmation: environment.PRODUCTION_CONFIRMATION ?? '',
  });

  const target = getFlyTarget(targetName);
  validateTargetConfigs(target);
  appendOutputs(environment.GITHUB_OUTPUT, deploymentOutputs(targetName));
}

function parseBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('BUILD_VERIFIED must be exactly true or false.');
}

function requireBlankConfirmation(value, targetLabel) {
  if (value !== '') {
    throw new Error(`The production confirmation must be blank for ${targetLabel}.`);
  }
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function appendOutputs(outputPath, outputs) {
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required.');
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    prepareFlyDeployment();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
