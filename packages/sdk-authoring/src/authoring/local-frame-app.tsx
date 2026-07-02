import { createNonceStyleElement } from '@lodariq/schema/dom';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { LocalAuthoringFrameOptions } from './local-frame-types';
import { LOCAL_AUTHORING_FRAME_CSS } from './local-frame-ui/styles';
import { LocalAuthoringFrameRoot } from './local-frame-ui/components/root';

export function mountLocalAuthoringReactFrame(options: LocalAuthoringFrameOptions): void {
  const style = createNonceStyleElement(options.root.ownerDocument, LOCAL_AUTHORING_FRAME_CSS);
  options.root.ownerDocument.head.appendChild(style);
  const reactRoot = createRoot(options.root);
  flushSync(() => {
    reactRoot.render(<LocalAuthoringFrameRoot options={options} />);
  });
}
