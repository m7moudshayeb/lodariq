'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { TourPlayer } from '@lodariq/sdk-runtime/renderers/tour';
import type { BrandThemeDefinition, BrandThemeSnapshot } from '@lodariq/schema';
import { compileBrandDraftPreview, compileBrandReviewPreviews } from '../lib/brand-preview';
import { Badge } from './ui/badge';

interface BrandTourComparisonProps {
  activeVersion: {
    version: number;
    snapshot: BrandThemeSnapshot;
  } | null;
  draft: BrandThemeDefinition;
  name: string;
  reviewKey: string;
  onError: (reviewKey: string) => void;
  onReady: (reviewKey: string) => void;
}

const COPY = {
  livePreview: msg({ id: 'dashboard.brand.preview.live', message: 'Live preview' }),
  tourCard: msg({ id: 'dashboard.brand.preview.tourCard', message: 'Product tour card' }),
  runtime: msg({ id: 'dashboard.brand.preview.runtime', message: 'Runtime' }),
  renderFailed: msg({
    id: 'dashboard.brand.preview.renderFailed',
    message: 'This Tour preview could not be rendered.',
  }),
  rendering: msg({ id: 'dashboard.brand.preview.rendering', message: 'Rendering Tour…' }),
  approvedVersion: msg({
    id: 'dashboard.brand.preview.approvedVersion',
    message: 'Approved version {version}',
  }),
  accessibleFallback: msg({
    id: 'dashboard.brand.preview.accessibleFallback',
    message: 'Accessible fallback',
  }),
  savedDraft: msg({ id: 'dashboard.brand.preview.savedDraft', message: 'Saved draft' }),
  before: msg({ id: 'dashboard.brand.preview.before', message: 'Before' }),
  after: msg({ id: 'dashboard.brand.preview.after', message: 'After' }),
  frameLabel: msg({
    id: 'dashboard.brand.preview.frameLabel',
    message: '{label}: {detail} Tour renderer preview',
  }),
  documentTitle: msg({
    id: 'dashboard.brand.preview.documentTitle',
    message: 'Brand review Tour preview',
  }),
  sampleHeading: msg({
    id: 'dashboard.brand.preview.sampleHeading',
    message: 'Find your launch queue',
  }),
  sampleParagraph: msg({
    id: 'dashboard.brand.preview.sampleParagraph',
    message: 'Review what is ready for staging without leaving the product.',
  }),
  back: msg({ id: 'dashboard.brand.preview.back', message: 'Back' }),
  continue: msg({ id: 'dashboard.brand.preview.continue', message: 'Continue' }),
  fallbackTheme: msg({
    id: 'dashboard.brand.preview.fallbackTheme',
    message: 'Brand theme',
  }),
  draft: msg({ id: 'dashboard.brand.preview.draft', message: 'draft' }),
} as const;

export function BrandDraftTourPreview({
  definition,
  name,
}: {
  definition: BrandThemeDefinition;
  name: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const previewCopy = React.useMemo(() => brandPreviewCopy(_), [_]);

  React.useEffect(() => {
    let disposed = false;
    let player: TourPlayer | null = null;
    setStatus('loading');
    void compileBrandDraftPreview({ draft: definition, name, copy: previewCopy })
      .then((artifact) => {
        if (disposed || !containerRef.current) return;
        player = new TourPlayer(artifact, { embeddedPreviewContainer: containerRef.current });
        player.start();
        setStatus('ready');
      })
      .catch(() => {
        if (!disposed) setStatus('error');
      });
    return () => {
      disposed = true;
      player?.stop();
    };
  }, [definition, name, previewCopy]);

  return (
    <section className="grid content-start gap-3" aria-labelledby="brand-preview-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {_(COPY.livePreview)}
          </p>
          <h3 className="mt-1 font-semibold" id="brand-preview-title">
            {_(COPY.tourCard)}
          </h3>
        </div>
        {status === 'ready' ? <Badge variant="outline">{_(COPY.runtime)}</Badge> : null}
      </div>
      <div
        className="relative h-[300px] overflow-hidden rounded-xl border border-border bg-[var(--surface-subtle)]"
        ref={containerRef}
      >
        {status !== 'ready' ? (
          <p
            className="absolute inset-0 z-10 grid place-items-center p-5 text-center text-sm text-muted-foreground"
            role={status === 'error' ? 'alert' : 'status'}
          >
            {status === 'error' ? _(COPY.renderFailed) : _(COPY.rendering)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function BrandTourComparison({
  activeVersion,
  draft,
  name,
  reviewKey,
  onError,
  onReady,
}: BrandTourComparisonProps): React.ReactElement {
  const { _ } = useLingui();
  const beforeContainerRef = React.useRef<HTMLDivElement>(null);
  const afterContainerRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const previewCopy = React.useMemo(() => brandPreviewCopy(_), [_]);

  React.useEffect(() => {
    let disposed = false;
    const players: TourPlayer[] = [];
    setStatus('loading');

    void compileBrandReviewPreviews({ activeVersion, draft, name, copy: previewCopy })
      .then(({ before, after }) => {
        if (disposed || !beforeContainerRef.current || !afterContainerRef.current) return;
        const beforePlayer = new TourPlayer(before, {
          embeddedPreviewContainer: beforeContainerRef.current,
        });
        const afterPlayer = new TourPlayer(after, {
          embeddedPreviewContainer: afterContainerRef.current,
        });
        players.push(beforePlayer, afterPlayer);
        beforePlayer.start();
        afterPlayer.start();
        setStatus('ready');
        onReady(reviewKey);
      })
      .catch(() => {
        if (disposed) return;
        setStatus('error');
        onError(reviewKey);
      });

    return () => {
      disposed = true;
      for (const player of players) player.stop();
    };
  }, [activeVersion, draft, name, onError, onReady, previewCopy, reviewKey]);

  const beforeDetail = activeVersion
    ? _({ ...COPY.approvedVersion, values: { version: activeVersion.version } })
    : _(COPY.accessibleFallback);

  return (
    <div className="grid gap-3 lg:grid-cols-2" data-brand-review-renderer={status}>
      <TourPreviewFrame
        containerRef={beforeContainerRef}
        detail={beforeDetail}
        isAfter={false}
        label={_(COPY.before)}
        status={status}
      />
      <TourPreviewFrame
        containerRef={afterContainerRef}
        detail={_(COPY.savedDraft)}
        isAfter
        label={_(COPY.after)}
        status={status}
      />
    </div>
  );
}

function TourPreviewFrame({
  containerRef,
  detail,
  isAfter,
  label,
  status,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  detail: string;
  isAfter: boolean;
  label: string;
  status: 'loading' | 'ready' | 'error';
}): React.ReactElement {
  const { _ } = useLingui();
  return (
    <section
      aria-label={_({ ...COPY.frameLabel, values: { label, detail } })}
      className="overflow-hidden rounded-xl border border-border bg-[var(--surface-subtle)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant={isAfter ? 'info' : 'outline'}>{label}</Badge>
          <span className="text-xs font-semibold text-muted-foreground">{detail}</span>
        </div>
        {status === 'ready' ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--success-fg)]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--success-fg)]" />
            {_(COPY.runtime)}
          </span>
        ) : null}
      </div>
      <div className="relative h-[300px]" ref={containerRef}>
        {status !== 'ready' ? (
          <p
            className="absolute inset-0 z-10 grid place-items-center px-5 text-center text-sm text-muted-foreground"
            role={status === 'error' ? 'alert' : 'status'}
          >
            {status === 'error' ? _(COPY.renderFailed) : _(COPY.rendering)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function brandPreviewCopy(translate: ReturnType<typeof useLingui>['_']) {
  return {
    title: translate(COPY.documentTitle),
    heading: translate(COPY.sampleHeading),
    paragraph: translate(COPY.sampleParagraph),
    back: translate(COPY.back),
    continue: translate(COPY.continue),
    fallbackThemeName: translate(COPY.fallbackTheme),
    draftSuffix: translate(COPY.draft),
  };
}
