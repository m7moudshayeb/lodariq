import { compileDocument } from '@talmeh/compiler';
import type { TalmehDocument } from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';

const output = document.getElementById('output');

async function main(): Promise<void> {
  const compiled = await compileDocument(tourFixture as TalmehDocument);
  if (output) output.textContent = JSON.stringify(compiled, null, 2);
}

void main();
