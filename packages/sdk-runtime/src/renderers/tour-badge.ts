export function appendTourBadge(card: HTMLElement): void {
  if (!card.isConnected || card.querySelector('.tour-lodariq-badge')) return;
  const badge = card.ownerDocument.createElement('a');
  badge.className = 'tour-lodariq-badge';
  badge.href = 'https://lodariq.io';
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.textContent = 'Powered by Lodariq';
  badge.style.cssText =
    'display:block;margin-top:var(--lq-tour-space-xs);color:var(--lq-tour-text-color,currentColor);font-size:var(--lq-tour-small-font-size,11px);line-height:1.4;opacity:.68;text-align:end;text-decoration:none';
  card.appendChild(badge);
}
