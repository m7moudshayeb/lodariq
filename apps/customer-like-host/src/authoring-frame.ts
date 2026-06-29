import type { TalmehDocument } from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringDevFrame } from '@talmeh/sdk-authoring/local-dev/frame';

const root = document.getElementById('authoring');
if (!root) throw new Error('#authoring not found');

mountLocalAuthoringDevFrame({
  root,
  baseDocument: tourFixture as TalmehDocument,
});
