import { parentPort } from 'node:worker_threads';
import {
  AnalyticsExportGenerationError,
  type AnalyticsExportContent,
} from '@lodariq/database';
import {
  buildAnalyticsExport,
  type AnalyticsExportGenerationInput,
} from './analytics-export-generation';

const port = parentPort;
if (!port) throw new Error('Analytics export generation worker requires a parent port');

port.on('message', (input: AnalyticsExportGenerationInput) => {
  try {
    const result = buildAnalyticsExport(input);
    port.postMessage({ ok: true, result });
  } catch (error) {
    const errorCode =
      error instanceof AnalyticsExportGenerationError ? error.code : 'generation_failed';
    port.postMessage({ ok: false, errorCode } satisfies GenerationFailure);
  }
});

interface GenerationFailure {
  ok: false;
  errorCode: AnalyticsExportGenerationError['code'];
}

interface GenerationSuccess {
  ok: true;
  result: AnalyticsExportContent;
}

export type AnalyticsExportGenerationWorkerResponse = GenerationFailure | GenerationSuccess;
