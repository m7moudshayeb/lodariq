import {
  buildAnalyticsSummaryCsv,
  buildRawAnalyticsJsonl,
  type AnalyticsExportContent,
  type PersistedAnalyticsExportJob,
} from '@lodariq/database';

export type AnalyticsExportGenerationInput = {
  job: PersistedAnalyticsExportJob;
  source:
    | {
        kind: 'raw-events-jsonl';
        events: Parameters<typeof buildRawAnalyticsJsonl>[1];
      }
    | {
        kind: 'summary-csv';
        analytics: Parameters<typeof buildAnalyticsSummaryCsv>[1];
      };
};

export function buildAnalyticsExport(
  input: AnalyticsExportGenerationInput,
): AnalyticsExportContent {
  if (input.source.kind === 'raw-events-jsonl') {
    return buildRawAnalyticsJsonl(input.job, input.source.events);
  }
  return buildAnalyticsSummaryCsv(input.job, input.source.analytics);
}
