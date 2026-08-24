import { useEffect, useState, type ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { Check, X } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

export function OperationsCopy({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const versions = snapshot.documentVersions ?? [];
  const suggestions = snapshot.copySuggestions ?? [];
  const pending = suggestions.filter((suggestion) => suggestion.status === 'pending');
  const [basisVersionId, setBasisVersionId] = useState('');
  const [referenceVersionId, setReferenceVersionId] = useState('');

  useEffect(() => {
    if (versions.length < 2) return;
    setBasisVersionId((current) =>
      versions.some((version) => version.id === current) ? current : versions[0]!.id,
    );
    setReferenceVersionId((current) =>
      versions.some((version) => version.id === current) ? current : versions[1]!.id,
    );
  }, [versions]);

  return (
    <section className="operations-copy" aria-label={authoringText('Copy suggestions')}>
      <div className="ops-box">
        <h3>{authoringText('Change-aware copy suggestions')}</h3>
        <p className="ops-box-body">
          {authoringText(
            'Each suggestion is bounded to one block, shows before and after text, and waits for an explicit apply. Applying changes the draft only; immutable releases never change automatically.',
          )}
        </p>
        <span className="ops-tag" data-tone={pending.length ? 'warning' : 'ok'}>
          {pending.length
            ? authoringText('{count} suggestion(s) to review', { count: pending.length })
            : authoringText('No pending copy suggestions')}
        </span>
        {versions.length >= 2 ? (
          <div className="ops-row">
            <label>
              <span>{authoringText('Current copy basis')}</span>
              <select
                value={basisVersionId}
                onChange={(event) => setBasisVersionId(event.currentTarget.value)}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {authoringText('Version {version}', { version: version.version })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{authoringText('Suggested copy reference')}</span>
              <select
                value={referenceVersionId}
                onChange={(event) => setReferenceVersionId(event.currentTarget.value)}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {authoringText('Version {version}', { version: version.version })}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ops-btn"
              disabled={
                !basisVersionId || !referenceVersionId || basisVersionId === referenceVersionId
              }
              onClick={() => controller.generateCopySuggestions(basisVersionId, referenceVersionId)}
              type="button"
            >
              {authoringText('Find copy changes')}
            </button>
          </div>
        ) : null}
      </div>
      {suggestions.length ? (
        <div className="ops-box">
          <ul className="ops-list">
            {suggestions.map((suggestion) => {
              const isPending = suggestion.status === 'pending';
              return (
                <li key={suggestion.id} data-suggestion-status={suggestion.status}>
                  <span>
                    <strong>{suggestion.path}</strong>
                    <span className="ops-list-meta">
                      {authoringText('Before')}: {suggestion.before}
                    </span>
                    <span className="ops-list-meta">
                      {authoringText('After')}: {suggestion.after}
                    </span>
                  </span>
                  <span className="ops-row">
                    <span className="ops-tag">{suggestion.confidence}%</span>
                    {!isPending ? (
                      <span className="ops-tag" data-tone="ok">
                        {suggestion.status === 'applied'
                          ? authoringText('Applied')
                          : authoringText('Dismissed')}
                      </span>
                    ) : null}
                    {isPending ? (
                      <>
                        <button
                          className="ops-btn"
                          onClick={() => controller.dismissCopySuggestion(suggestion.id)}
                          type="button"
                        >
                          <X size={13} strokeWidth={2} aria-hidden="true" />
                          {authoringText('Dismiss')}
                        </button>
                        <button
                          className="ops-btn"
                          data-variant="primary"
                          onClick={() => controller.applyCopySuggestion(suggestion)}
                          type="button"
                        >
                          <Check size={13} strokeWidth={2} aria-hidden="true" />
                          {authoringText('Apply to draft')}
                        </button>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : versions.length < 2 ? (
        <p className="ops-callout" data-tone="info" role="status">
          {authoringText('Save another document version to create bounded copy drift evidence.')}
        </p>
      ) : null}
    </section>
  );
}
