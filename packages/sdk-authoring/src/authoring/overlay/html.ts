/** Shared by every overlay surface that builds markup from labels. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/gu, (character) => {
    if (character === '&') return '&amp;';
    if (character === '"') return '&quot;';
    if (character === '<') return '&lt;';
    return '&gt;';
  });
}
