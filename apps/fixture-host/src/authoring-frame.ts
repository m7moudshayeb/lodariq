import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringDevFrame } from '@lodariq/sdk-authoring/local-dev/frame';

const root = document.getElementById('authoring');
if (!root) throw new Error('#authoring not found');

void mountLocalAuthoringDevFrame({
  root,
  baseDocument: tourFixture as LodariqDocument,
});
