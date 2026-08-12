import { compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const output = document.getElementById('output');

async function main(): Promise<void> {
  const compiled = await compileDocument({
    document: tourFixture as LodariqDocument,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  if (output) output.textContent = JSON.stringify(compiled, null, 2);
}

void main();
