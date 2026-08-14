import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { ArrowLeft, Rocket } from '../design-system';

export function PanelModeShell({
  children,
  className,
  controller,
  description,
  eyebrow,
  focusToken,
  title,
}: {
  children: ReactNode;
  className?: string;
  controller: LocalAuthoringFrameController;
  description?: string;
  eyebrow: string;
  focusToken: number;
  title: string;
}) {
  return (
    <section className={`panel-mode-shell ${className ?? ''}`.trim()} aria-label={title}>
      <header className="panel-mode-header">
        <button
          aria-label={authoringText('Back to authoring')}
          className="panel-mode-back"
          onClick={() => controller.closePanelMode()}
          type="button"
        >
          <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <span>
          <small>{eyebrow}</small>
          <strong key={focusToken} tabIndex={-1} data-panel-mode-heading>
            {title}
          </strong>
          {description ? <p className="panel-mode-subtitle">{description}</p> : null}
        </span>
      </header>
      <div className="panel-mode-body">{children}</div>
    </section>
  );
}

export function PanelFeedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  return (
    <p className={`panel-feedback ${error ? 'error' : 'notice'}`} role={error ? 'alert' : 'status'}>
      {error ?? notice}
    </p>
  );
}

export function PanelEmptyState({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="panel-empty-state">
      <span className="panel-mode-card-icon" aria-hidden="true">
        <Rocket size={17} strokeWidth={2.1} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
