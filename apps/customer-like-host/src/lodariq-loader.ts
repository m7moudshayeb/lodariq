import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { installLocalLodariqAuthoringFromScript } from '@lodariq/sdk-authoring/local-dev/install';

async function bootLocalLodariq(): Promise<void> {
  const lodariq = await installLocalLodariqAuthoringFromScript({
    baseDocument: tourFixture as LodariqDocument,
    iframeSrc: '/authoring.html',
  });
  if (!lodariq) throw new Error('Lodariq loader config is invalid');
}

void bootLocalLodariq();
