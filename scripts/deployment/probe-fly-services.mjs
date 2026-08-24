import console from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

const REQUEST_ATTEMPTS = 12;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 5_000;
const MAX_REDIRECTS = 5;
const AUTHORING_MARKER = '<div id="authoring" data-state="waiting">';

export function assertExactHealthContract(value) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    value.ok !== true ||
    Object.keys(value).length !== 1
  ) {
    throw new Error('Health probe did not return the exact ok contract.');
  }
}

export function assertOpenApiContract(value) {
  if (value?.openapi !== '3.0.3' || value?.info?.title !== 'Lodariq Control API') {
    throw new Error('OpenAPI probe did not return the expected Lodariq contract.');
  }
}

export async function probeFlyServices(environment = process.env) {
  const editorOrigin = requireHttpsOrigin(environment.EDITOR_ORIGIN, 'EDITOR_ORIGIN');
  const apiOrigin = requireHttpsOrigin(environment.API_ORIGIN, 'API_ORIGIN');
  const dashboardOrigin = requireHttpsOrigin(environment.DASHBOARD_ORIGIN, 'DASHBOARD_ORIGIN');

  assertExactHealthContract(await fetchJson(new URL('/healthz', editorOrigin)));
  assertExactHealthContract(await fetchJson(new URL('/readyz', apiOrigin)));
  assertExactHealthContract(await fetchJson(new URL('/healthz', dashboardOrigin)));
  assertOpenApiContract(await fetchJson(new URL('/v1/openapi.json', apiOrigin)));

  const authoring = await fetchText(new URL('/authoring.html', editorOrigin));
  if (!authoring.includes(AUTHORING_MARKER)) {
    throw new Error('Editor authoring probe did not return the waiting contract.');
  }
}

function requireHttpsOrigin(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an exact HTTPS origin.`);
  }
  return url;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await fetchHttps(url);
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }
  throw new Error(`Probe failed for ${url.href}: ${errorMessage(lastError)}`);
}

async function fetchHttps(initialUrl) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await globalThis.fetch(url, {
      redirect: 'manual',
      signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`HTTP ${response.status} without a redirect location`);
      const redirectedUrl = new URL(location, url);
      if (redirectedUrl.protocol !== 'https:') {
        throw new Error('Probe refused a redirect outside HTTPS.');
      }
      url = redirectedUrl;
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
  throw new Error(`Probe exceeded ${MAX_REDIRECTS} HTTPS redirects.`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await probeFlyServices();
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
