import type { BlockLayoutProps } from '@lodariq/schema';
import type { CSSProperties } from 'react';

export type CanvasToolbarPosition = { left: number; top: number };

export function canvasToolbarStyle(
  position: CanvasToolbarPosition | null,
): CSSProperties | undefined {
  if (!position) return undefined;
  return {
    '--storyboard-toolbar-left': `${position.left}px`,
    '--storyboard-toolbar-top': `${position.top}px`,
  } as CSSProperties;
}

export function blockSpacingAfterStyle(
  layout: BlockLayoutProps | undefined,
): CSSProperties | undefined {
  if (layout?.spacingAfterPx === undefined) return undefined;
  return { '--lq-block-spacing-after': `${layout.spacingAfterPx}px` } as CSSProperties;
}
