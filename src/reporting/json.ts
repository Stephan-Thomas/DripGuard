import { DripGuardResult } from '../core/types.js';

export function formatJsonReport(result: DripGuardResult, pretty: boolean = true): string {
  const jsonSchemaEnvelope = {
    $schema: 'https://dripguard.dev/schemas/report-v1.json',
    tool: {
      name: 'DripGuard',
      version: '0.1.0',
      description: 'Continuous dependency & Drips funding drift verification'
    },
    ...result
  };

  return JSON.stringify(jsonSchemaEnvelope, null, pretty ? 2 : 0);
}
