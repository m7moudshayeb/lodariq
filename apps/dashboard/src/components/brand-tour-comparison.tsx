'use client';

import * as React from 'react';
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

export function BrandDraftTourPreview({
  definition,
  name,
}: {
  definition: BrandThemeDefinition;
  name: string;
}): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');

  React.useEffect(() => {
    let disposed = false;
    let player: TourPlayer | null = null;
    setStatus('loading');
    void compileBrandDraftPreview({ draft: definition, name })
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
  }, [definition, name]);

  return (
    <section className="grid content-start gap-3" aria-labelledby="brand-preview-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Live preview
          </p>
          <h3 className="mt-1 font-semibold" id="brand-preview-title">
            Product tour card
          </h3>
        </div>
        {status === 'ready' ? <Badge variant="outline">Runtime</Badge> : null}
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
            {status === 'error' ? 'This Tour preview could not be rendered.' : 'Rendering Tour…'}
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
  const beforeContainerRef = React.useRef<HTMLDivElement>(null);
  const afterContainerRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');

  React.useEffect(() => {
    let disposed = false;
    const players: TourPlayer[] = [];
    setStatus('loading');

    void compileBrandReviewPreviews({ activeVersion, draft, name })
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
  }, [activeVersion, draft, name, onError, onReady, reviewKey]);

  return (
    <div className="grid gap-3 lg:grid-cols-2" data-brand-review-renderer={status}>
      <TourPreviewFrame
        containerRef={beforeContainerRef}
        detail={activeVersion ? `Approved version ${activeVersion.version}` : 'Accessible fallback'}
        label="Before"
        status={status}
      />
      <TourPreviewFrame
        containerRef={afterContainerRef}
        detail="Saved draft"
        label="After"
        status={status}
      />
    </div>
  );
}

function TourPreviewFrame({
  containerRef,
  detail,
  label,
  status,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  detail: string;
  label: string;
  status: 'loading' | 'ready' | 'error';
}): React.ReactElement {
  return (
    <section
      aria-label={`${label}: ${detail} Tour renderer preview`}
      className="overflow-hidden rounded-xl border border-border bg-[var(--surface-subtle)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant={label === 'After' ? 'info' : 'outline'}>{label}</Badge>
          <span className="text-xs font-semibold text-muted-foreground">{detail}</span>
        </div>
        {status === 'ready' ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--success-fg)]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--success-fg)]" />
            Runtime
          </span>
        ) : null}
      </div>
      <div className="relative h-[300px]" ref={containerRef}>
        {status !== 'ready' ? (
          <p
            className="absolute inset-0 z-10 grid place-items-center px-5 text-center text-sm text-muted-foreground"
            role={status === 'error' ? 'alert' : 'status'}
          >
            {status === 'error' ? 'This Tour preview could not be rendered.' : 'Rendering Tour…'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
