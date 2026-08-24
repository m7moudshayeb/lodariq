// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { isInsideCollection } from '@lodariq/schema/dom';

/**
 * Where position means a record, and where it means layout.
 *
 * Inside a collection the third row is a different project once the list is
 * sorted, and nothing fails when that happens — so positional evidence is
 * refused there and the author is asked instead. Everywhere else the question is
 * ours to answer, and asking it is an interruption with no decision behind it.
 *
 * The refusals matter more than the permissions: admitting position inside real
 * data is how a tour ends up pointing at the wrong record in silence.
 */
const pick = (selector: string): Element => document.querySelector(selector)!;

describe('what counts as a collection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('refuses, because position is a fact about the data', () => {
    it('a control inside a table row', () => {
      document.body.innerHTML = `
        <main><table><tbody>
          <tr><td><button id="row" type="button">Open</button></td></tr>
          <tr><td><button type="button">Open</button></td></tr>
        </tbody></table></main>`;
      expect(isInsideCollection(pick('#row'))).toBe(true);
    });

    it('a control inside a list item', () => {
      document.body.innerHTML = `
        <main><ul><li><button id="item" type="button">Open</button></li><li></li></ul></main>`;
      expect(isInsideCollection(pick('#item'))).toBe(true);
    });

    it('the card grid nothing declares', () => {
      document.body.innerHTML = `
        <main><div class="grid">
          <div class="card"><button id="card" type="button">Open</button></div>
          <div class="card"><button type="button">Open</button></div>
          <div class="card"><button type="button">Open</button></div>
        </div></main>`;
      expect(isInsideCollection(pick('#card'))).toBe(true);
    });

    it('an option in a listbox', () => {
      document.body.innerHTML = `
        <main><div role="listbox"><div id="option" role="option">Germany</div></div></main>`;
      expect(isInsideCollection(pick('#option'))).toBe(true);
    });
  });

  describe('allows, because position is a fact about the layout', () => {
    it('one of three buttons in a toolbar', () => {
      document.body.innerHTML = `
        <main><div class="actions">
          <button id="toolbar" type="button">Import</button>
          <button type="button">Filter</button>
          <button type="button">Create</button>
        </div></main>`;
      expect(isInsideCollection(pick('#toolbar'))).toBe(false);
    });

    it('one of three tabs', () => {
      // ARIA defines a tablist as a container of commands, not of records: the
      // second tab is the same tab tomorrow.
      document.body.innerHTML = `
        <main><div role="tablist">
          <button id="tab" role="tab" type="button">Recent</button>
          <button role="tab" type="button">A–Z</button>
          <button role="tab" type="button">By owner</button>
        </div></main>`;
      expect(isInsideCollection(pick('#tab'))).toBe(false);
    });

    it('a control on a page whose scaffolding happens to repeat', () => {
      // Three bare divs are how every page is built. Reading them as a list put
      // every control on the page out of reach of positional evidence.
      document.body.innerHTML = `
        <div><div><div><main>
          <div><button id="deep" type="button">Import</button><button type="button">Filter</button></div>
        </main></div></div></div>`;
      expect(isInsideCollection(pick('#deep'))).toBe(false);
    });

    it('a control in a header that sits above a card grid', () => {
      // The regression this exists for: one grid anywhere on the page refused
      // positional evidence to every control on it.
      document.body.innerHTML = `
        <main>
          <header><button id="header" type="button">Import</button></header>
          <div class="grid">
            <div class="card">a</div><div class="card">b</div><div class="card">c</div>
          </div>
        </main>`;
      expect(isInsideCollection(pick('#header'))).toBe(false);
    });
  });
});
