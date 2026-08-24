/**
 * Browser APIs jsdom lacks but Radix and Lexical call on real pointer and focus
 * paths. `vitest.setup.ts` evaluates in the runner's realm, so its copies of
 * these guards never reach a per-file jsdom environment — a suite that drives
 * these paths has to install them itself.
 */
export function installJsdomInteractionShims(): void {
  if (typeof Element === 'undefined') return;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  if (typeof Range !== 'undefined' && typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return new DOMRect(40, 20, 80, 16);
    };
  }
}
