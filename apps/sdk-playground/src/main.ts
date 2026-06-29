import { compileDocument } from '@lodariq/compiler';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const output = document.getElementById('output');

async function main(): Promise<void> {
  const compiled = await compileDocument(tourFixture as LodariqDocument);
  if (output) output.textContent = JSON.stringify(compiled, null, 2);
}

void main();
