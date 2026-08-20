import { CREATOR_CHROME_TOKENS } from '../../creator-chrome-tokens';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import { useLayoutEffect } from 'react';

const OPTIONAL_PANEL_MODE_CSS = `
  .panel-mode-shell {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--lq-color-panel);
  }

  .panel-mode-header {
    display: grid;
    min-height: 64px;
    grid-template-columns: 44px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.06);
    padding: 8px 16px 8px 12px;
  }

  .panel-mode-header > span {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .panel-mode-header small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }

  .panel-mode-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    line-height: 1.35;
    outline: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-mode-header strong:focus-visible {
    border-radius: 8px;
    box-shadow: 0 0 0 2px var(--lq-color-blue);
  }

  .panel-mode-back {
    display: inline-grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
  }

  .panel-mode-back:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
  }

  .panel-mode-body {
    display: grid;
    min-height: 0;
    align-content: start;
    gap: 12px;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 16px 16px 24px;
    scrollbar-gutter: stable;
  }

  .panel-feedback {
    border: 1px solid var(--lq-color-success-border);
    border-radius: 8px;
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    line-height: 1.45;
    padding: 8px 12px;
  }

  .panel-feedback.error {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .panel-mode-card,
  .panel-mode-section,
  .panel-mode-disclosure {
    display: grid;
    gap: 12px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    padding: 12px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
  }

  /* The card is a grid, so a lone button stretches the full measure. This one
     is a way out, not a primary action bar. */
  .release-blocker-card > button {
    justify-self: start;
  }

  .release-blocker-detail {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.6;
  }

  .panel-mode-disclosure {
    padding: 0;
  }

  .panel-mode-disclosure > summary {
    display: grid;
    min-height: 58px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border-radius: 12px;
    cursor: pointer;
    list-style: none;
    padding: 12px 12px;
  }

  .panel-mode-disclosure > summary::-webkit-details-marker {
    display: none;
  }

  .panel-mode-disclosure > summary:hover {
    background: var(--lq-color-primary-soft);
  }

  .panel-mode-disclosure > summary > span {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .panel-mode-disclosure > summary small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .panel-mode-disclosure > summary strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    line-height: 1.35;
  }

  .panel-mode-disclosure > summary span > span {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-mode-disclosure-chevron {
    color: var(--lq-color-muted);
    transition: transform 140ms ease;
  }

  .panel-mode-disclosure[open] .panel-mode-disclosure-chevron {
    transform: rotate(90deg);
  }

  .panel-mode-disclosure-body {
    display: grid;
    gap: 12px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding: 12px;
  }

  .panel-mode-card-heading {
    display: grid;
    min-width: 0;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .panel-mode-card-icon {
    display: inline-grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-primary);
  }

  .panel-mode-card-heading small,
  .panel-mode-section-heading small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.055em;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .panel-mode-card-heading > span:nth-child(2),
  .panel-mode-section-heading > span {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .panel-mode-card-heading strong,
  .panel-mode-section-heading strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    line-height: 1.35;
    text-overflow: ellipsis;
  }

  .panel-status-pill,
  .panel-confidence-pill {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    line-height: 1;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .panel-status-pill.approved,
  .panel-status-pill.passed,
  .panel-status-pill.current,
  .panel-confidence-pill.high {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .panel-status-pill.draft,
  .panel-status-pill.waiting-approval,
  .panel-status-pill.failed,
  .panel-confidence-pill.medium,
  .panel-confidence-pill.low {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .panel-status-pill.running {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .panel-source-line {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 4px 8px;
    color: var(--lq-color-primary);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    line-height: 1.4;
  }

  .panel-source-line > span + span::before {
    content: "·";
    margin-right: 8px;
    color: var(--lq-color-subtle);
  }

  .panel-mode-help,
  .panel-mode-inline-note {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.5;
  }

  .panel-mode-inline-note {
    padding: 0 4px;
  }

  .panel-mode-primary-actions,
  .panel-mode-sticky-actions {
    display: grid;
    gap: 8px;
  }

  .panel-mode-sticky-actions {
    position: sticky;
    bottom: -22px;
    z-index: 2;
    margin: 4px -16px -24px;
    border-top: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    padding: 12px 16px 16px;
    backdrop-filter: blur(12px);
  }

  .panel-mode-primary-button,
  .panel-mode-secondary-button {
    display: inline-flex;
    width: 100%;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 12px;
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 8px 12px;
    box-shadow: 0 8px 20px color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 18%, transparent);
  }

  .panel-mode-secondary-button {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    box-shadow: none;
  }

  .panel-mode-primary-button:hover:not(:disabled) {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-hover);
  }

  .panel-mode-secondary-button:hover:not(:disabled) {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .panel-mode-primary-button:disabled,
  .panel-mode-secondary-button:disabled {
    cursor: not-allowed;
    opacity: 0.54;
  }

  .panel-mode-section-heading {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-mode-text-button {
    min-height: 44px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    padding: 8px 8px;
  }

  .panel-mode-text-button:hover {
    background: var(--lq-color-primary-soft);
  }

  .appearance-choice-group {
    display: grid;
    gap: 8px;
    margin: 0;
    border: 0;
    padding: 0;
  }

  .appearance-choice-group legend {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    line-height: 1.3;
    padding: 0;
    margin-bottom: 4px;
  }

  .appearance-choice-group > div {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 4px;
  }

  .appearance-choice-group button {
    min-height: 44px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 8px;
  }

  .appearance-choice-group button:hover,
  .appearance-choice-group button.selected {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .brand-change-list {
    display: grid;
    gap: 8px;
  }

  .brand-change-row {
    display: grid;
    gap: 8px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 8px;
    background: var(--lq-color-page);
    padding: 8px;
  }

  .brand-change-label {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
  }

  .brand-change-values {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .brand-change-values > span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .brand-change-values small,
  .brand-change-consequence {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.35;
  }

  .brand-change-values strong {
    overflow: hidden;
    font-size: var(--lq-font-xs);
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-mode-callout,
  .exact-artifact-banner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    border: 1px solid var(--lq-color-primary-border);
    border-radius: 12px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    padding: 12px;
  }

  .panel-mode-callout p {
    color: var(--lq-color-ink-soft);
    font-size: 8px;
    line-height: 1.5;
  }

  .panel-empty-state {
    display: grid;
    justify-items: center;
    gap: 8px;
    border: 1px dashed var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    padding: 32px 16px;
    text-align: center;
  }

  .panel-empty-state strong {
    font-size: var(--lq-font-sm);
  }

  .panel-empty-state p {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.5;
  }

  .panel-release-truth {
    overflow-wrap: anywhere;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    line-height: 1.4;
    padding: 0 4px;
  }

  .panel-mode-card-icon.warning {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .panel-check-list,
  .promotion-change-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .panel-check-list li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    color: var(--lq-color-muted);
  }

  .panel-check-list li.passed {
    color: var(--lq-color-success);
  }

  .panel-check-list li.failed {
    color: var(--lq-color-danger);
  }

  .panel-check-list li.warning {
    color: var(--lq-color-warning);
  }

  .panel-check-list li > span {
    display: grid;
    gap: 1px;
  }

  .panel-check-list strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    line-height: 1.35;
  }

  .panel-check-list small {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.4;
  }

  .release-findings-section {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
  }

  .release-finding-list {
    padding-top: 1px;
  }

  .release-finding-severity {
    font-weight: var(--lq-weight-bold);
  }

  .artifact-inline-facts,
  .panel-fact-list {
    display: grid;
    gap: 0;
    margin: 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 8px;
  }

  .artifact-inline-facts > div,
  .panel-fact-list > div {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(90px, 0.7fr) minmax(0, 1fr);
    gap: 8px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 8px 8px;
  }

  .artifact-inline-facts > div:last-child,
  .panel-fact-list > div:last-child {
    border-bottom: 0;
  }

  .artifact-inline-facts dt,
  .panel-fact-list dt {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
  }

  .artifact-inline-facts dd,
  .panel-fact-list dd {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--lq-color-ink);
    font-size: 8px;
    font-weight: var(--lq-weight-semibold);
    line-height: 1.35;
    margin: 0;
  }

  .exact-artifact-banner {
    align-items: center;
  }

  .exact-artifact-banner > span {
    display: grid;
    gap: 4px;
  }

  .exact-artifact-banner strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
  }

  .exact-artifact-banner small {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.35;
  }

  .promotion-change-list li {
    position: relative;
    color: var(--lq-color-ink-soft);
    font-size: 8px;
    line-height: 1.45;
    padding-left: 16px;
  }

  .promotion-change-list li::before {
    position: absolute;
    top: 0.52em;
    left: 4px;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: var(--lq-color-primary);
    content: "";
  }


  .release-history-entry {
    margin-top: 16px;
  }

  .release-history-environment-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .release-history-panel,
  .release-recovery-confirmation {
    display: grid;
    gap: 16px;
  }

  .release-history-list {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .release-history-item {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 12px;
    background: var(--lq-color-panel);
    padding: 12px;
  }

  .release-history-item[data-current='true'] {
    border-color: color-mix(in srgb, var(--lq-color-blue) 42%, var(--lq-color-border-soft));
    box-shadow: inset 3px 0 0 var(--lq-color-blue);
  }

  .release-history-item header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .release-history-item header strong {
    margin-right: auto;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .release-history-item header span {
    border-radius: 999px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: 4px 8px;
  }

  .release-history-item > article > p {
    margin: 8px 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  .release-history-item dl,
  .release-recovery-guard {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .release-history-item dl > div,
  .release-recovery-guard > div {
    display: grid;
    grid-template-columns: minmax(110px, 0.42fr) minmax(0, 1fr);
    gap: 12px;
    font-size: var(--lq-font-xs);
  }

  .release-history-item dt,
  .release-recovery-guard dt {
    color: var(--lq-color-muted);
  }

  .release-history-item dd,
  .release-recovery-guard dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--lq-color-ink);
  }

  .release-recovery-confirmation form,
  .panel-mode-field {
    display: grid;
    gap: 8px;
  }

  .release-recovery-confirmation form {
    gap: 16px;
  }

  .panel-mode-field > span {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .panel-mode-field select,
  .panel-mode-field textarea {
    width: 100%;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    font: inherit;
    padding: 8px 12px;
  }

  .panel-mode-field textarea {
    resize: vertical;
  }

  .panel-mode-field small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .panel-mode-field [aria-invalid='true'] {
    border-color: var(--lq-color-danger);
  }

  .release-history-panel .panel-mode-primary-actions,
  .release-recovery-confirmation .panel-mode-primary-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .appearance-mode-shell .panel-mode-header {
    min-height: 74px;
    gap: 12px;
    padding: 12px 24px 12px 8px;
  }

  .appearance-mode-shell .panel-mode-header > span {
    gap: 1px;
  }

  .appearance-mode-shell .panel-mode-header strong {
    font-size: var(--lq-font-md);
    line-height: 1.3;
  }

  .panel-mode-subtitle {
    overflow: hidden;
    margin: 4px 0 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .appearance-mode-shell .panel-mode-body {
    gap: 0;
    padding: 16px 24px 32px;
  }

  .appearance-mode-shell .panel-feedback {
    margin: 0 0 16px;
  }

  .appearance-flow {
    display: grid;
    width: 100%;
    max-width: 780px;
    gap: 0;
    margin: 0 auto;
    padding: 0;
    list-style: none;
  }

  .appearance-step {
    position: relative;
    display: grid;
    min-width: 0;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 16px;
  }

  .appearance-step:not(:last-child)::after {
    position: absolute;
    top: 24px;
    bottom: -20px;
    left: 10px;
    width: 1px;
    background: var(--lq-color-border);
    content: "";
  }

  .appearance-step-marker {
    position: relative;
    z-index: 1;
    display: inline-grid;
    width: 22px;
    height: 24px;
    place-items: center;
    border: 1px solid var(--lq-color-primary);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    line-height: 1;
  }

  .appearance-step.completed .appearance-step-marker {
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .appearance-step-content {
    min-width: 0;
  }

  .appearance-step:not(:last-child) .appearance-step-content {
    margin-bottom: 24px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding-bottom: 24px;
  }

  .appearance-step-heading {
    display: flex;
    min-height: 24px;
    min-width: 0;
    align-items: center;
    margin-bottom: 12px;
  }

  .appearance-step-heading-copy {
    display: inline-flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .appearance-step-heading-copy > strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    line-height: 1.35;
  }

  .appearance-step-pill {
    display: inline-flex;
    min-height: 16px;
    align-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    line-height: 1;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .appearance-step-pill.inherited {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .appearance-brand-row {
    display: grid;
    min-height: 40px;
    min-width: 0;
    grid-template-columns: minmax(155px, 1.1fr) auto minmax(135px, 0.85fr) minmax(150px, 1fr);
    align-items: center;
    gap: 12px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--lq-color-primary-soft) 42%, var(--lq-color-panel));
    padding: 12px 12px;
  }

  .appearance-brand-name,
  .appearance-brand-source {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .appearance-brand-name > strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .appearance-brand-row .panel-mode-card-icon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--lq-color-panel);
  }

  .appearance-mode-shell .panel-status-pill {
    min-height: 19px;
    padding: 4px 8px;
  }

  .appearance-brand-source {
    color: var(--lq-color-primary);
  }

  .appearance-brand-source > span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .appearance-brand-source strong {
    overflow: hidden;
    font-size: var(--lq-font-xs);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .appearance-brand-source small {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.3;
  }

  .appearance-brand-row .panel-mode-help {
    margin: 0;
    font-size: var(--lq-font-xs);
    line-height: 1.45;
  }

  .appearance-mode-shell .brand-drift-panel {
    gap: 0;
    overflow: hidden;
    border-radius: 8px;
    padding: 0;
    box-shadow: none;
  }

  .brand-drift-summary {
    display: grid;
    min-height: 70px;
    min-width: 0;
    grid-template-columns: minmax(145px, 0.72fr) minmax(210px, 1.2fr) auto;
    align-items: center;
    gap: 16px;
    padding: 12px 12px;
  }

  .brand-drift-summary .panel-mode-section-heading {
    align-items: center;
  }

  .brand-drift-status {
    display: grid;
    min-width: 0;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
  }

  .brand-drift-status-icon {
    display: inline-grid;
    width: 18px;
    height: 16px;
    place-items: center;
    color: var(--lq-color-danger);
  }

  .brand-drift-status.unchanged .brand-drift-status-icon,
  .brand-drift-status.unchanged strong {
    color: var(--lq-color-success);
  }

  .brand-drift-status.warning .brand-drift-status-icon,
  .brand-drift-status.warning strong {
    color: var(--lq-color-warning);
  }

  .brand-drift-status-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .brand-drift-status-copy strong {
    color: var(--lq-color-danger);
    font-size: var(--lq-font-xs);
    line-height: 1.35;
  }

  .brand-drift-status-copy p,
  .brand-drift-status-copy small {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.45;
  }

  .brand-drift-summary > .panel-mode-text-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    justify-self: end;
    white-space: nowrap;
  }

  .appearance-mode-shell .brand-drift-panel > :not(.brand-drift-summary) {
    margin-right: 12px;
    margin-left: 12px;
  }

  .appearance-mode-shell .brand-drift-panel > :last-child:not(.brand-drift-summary) {
    margin-bottom: 12px;
  }

  .appearance-match-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 16px;
  }

  .appearance-match-actions .panel-mode-primary-button {
    min-width: 126px;
    width: auto;
  }

  .appearance-match-actions .panel-mode-secondary-button {
    min-width: 154px;
    width: auto;
  }

  .appearance-match-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 12px 0 0;
  }

  .appearance-match-note svg {
    flex: none;
    margin-top: 1px;
  }

  .appearance-step-heading-with-action {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
    margin-bottom: 16px;
  }

  .appearance-step-heading-with-action > span:first-child {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .appearance-step-summary {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-semibold);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .appearance-reset-button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    gap: 8px;
  }

  .appearance-overrides-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 32px;
    row-gap: 16px;
  }

  .appearance-overrides-grid .appearance-choice-group > div {
    grid-auto-columns: minmax(0, 1fr);
    gap: 0;
  }

  .appearance-overrides-grid .appearance-choice-group button {
    position: relative;
    min-height: 36px;
    border-radius: 0;
    padding: 4px 8px;
  }

  .appearance-mode-shell .panel-mode-text-button {
    min-height: 36px;
    padding: 4px 8px;
  }

  .appearance-overrides-grid .appearance-choice-group button + button {
    margin-left: -1px;
  }

  .appearance-overrides-grid .appearance-choice-group button:first-child {
    border-radius: 8px 0 0 8px;
  }

  .appearance-overrides-grid .appearance-choice-group button:last-child {
    border-radius: 0 8px 8px 0;
  }

  .appearance-overrides-grid .appearance-choice-group button.selected {
    z-index: 1;
  }

  @container authoring-frame (max-width: 620px) {
    .appearance-mode-shell .panel-mode-body {
      padding-right: 16px;
      padding-left: 16px;
      scrollbar-gutter: auto;
    }

    .appearance-brand-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .appearance-brand-row .panel-mode-help {
      grid-column: 1 / -1;
    }

    .brand-drift-summary {
      grid-template-columns: minmax(120px, 0.7fr) minmax(0, 1.3fr);
      gap: 12px;
    }

    .brand-drift-summary > .panel-mode-text-button {
      grid-column: 2;
      justify-self: start;
    }

    .appearance-overrides-grid {
      column-gap: 16px;
    }
  }

  @container authoring-frame (max-width: 460px) {
    .appearance-mode-shell .panel-mode-header {
      min-height: 70px;
      padding-right: 12px;
      padding-left: 4px;
    }

    .panel-mode-subtitle {
      display: -webkit-box;
      overflow: hidden;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .appearance-mode-shell .panel-mode-body {
      padding: 16px 12px 24px;
    }

    .appearance-step {
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 8px;
    }

    .appearance-step-marker {
      width: 24px;
      height: 24px;
      font-size: var(--lq-font-xs);
    }

    .appearance-step:not(:last-child)::after {
      top: 26px;
      left: 11px;
    }

    .appearance-brand-row,
    .brand-drift-summary {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    .appearance-brand-row .panel-status-pill,
    .brand-drift-summary > .panel-mode-text-button {
      justify-self: start;
    }

    .appearance-brand-row .panel-mode-help,
    .brand-drift-summary > .panel-mode-text-button {
      grid-column: 1;
    }

    .appearance-match-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }

    .appearance-match-actions .panel-mode-primary-button,
    .appearance-match-actions .panel-mode-secondary-button {
      width: 100%;
    }

    .appearance-step-heading-with-action {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }

    .appearance-reset-button {
      justify-self: start;
    }

    .appearance-overrides-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
  }

`;

interface OptionalPanelStyleRecord {
  references: number;
  style: HTMLStyleElement;
}

const OPTIONAL_PANEL_STYLES = new WeakMap<Document, OptionalPanelStyleRecord>();

export function useOptionalPanelModeStyles(): void {
  useLayoutEffect(() => {
    const ownerDocument = globalThis.document;
    const existing = OPTIONAL_PANEL_STYLES.get(ownerDocument);
    if (existing) {
      existing.references += 1;
      return () => releaseOptionalPanelModeStyles(ownerDocument);
    }

    const style = createNonceStyleElement(ownerDocument, OPTIONAL_PANEL_MODE_CSS);
    style.dataset.lodariqOptionalPanelStyles = 'true';
    ownerDocument.head.appendChild(style);
    OPTIONAL_PANEL_STYLES.set(ownerDocument, { references: 1, style });
    return () => releaseOptionalPanelModeStyles(ownerDocument);
  }, []);
}

function releaseOptionalPanelModeStyles(ownerDocument: Document): void {
  const record = OPTIONAL_PANEL_STYLES.get(ownerDocument);
  if (!record) return;
  record.references -= 1;
  if (record.references > 0) return;
  record.style.remove();
  OPTIONAL_PANEL_STYLES.delete(ownerDocument);
}
