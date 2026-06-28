import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
  type PreviewPatchOperation,
  type TalmehBlock,
  type TalmehDocument,
} from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';
import {
  attachTargetToBlocks,
  hasBlock,
  LOCAL_AUTHORING_SESSION_ID,
  moveTopLevelBlock as moveTopLevelBlocks,
  reorderTopLevelBlock as reorderTopLevelBlocks,
  transformBlocks,
  type BlockDirection,
} from '@talmeh/sdk-authoring';
import { AuthoringBridge, createBridgeCorrelationId } from '@talmeh/sdk-authoring/bridge';
import {
  blocksFromSafePasteData,
  createBlockId,
  createTargetId,
} from '@talmeh/sdk-authoring/editor';
import {
  compilePreview,
  exportDocument,
  importDocument,
  loadDocument,
  resetLocalDocuments,
  saveDocument,
} from '@talmeh/sdk-runtime/talmeh-local-dev';

const root = document.getElementById('authoring');
if (!root) throw new Error('#authoring not found');

const baseDocument = tourFixture as TalmehDocument;
let documentState = loadDocument(baseDocument.id) ?? baseDocument;
let slashOpen = false;
let draggingBlockId: string | null = null;
const undoStack: TalmehDocument[] = [];
const redoStack: TalmehDocument[] = [];
const bridge = new AuthoringBridge(window.parent, {
  allowedOrigins: [window.location.origin],
  targetOrigin: window.location.origin,
  onMessage: handleBridgeMessage,
});
bridge.start();
window.addEventListener('pagehide', () => bridge.stop());

root.innerHTML = `
  <main class="shell">
    <header>
      <div>
        <h1>Local authoring</h1>
        <p id="status" aria-live="polite"></p>
      </div>
	      <div class="actions">
	        <button type="button" data-action="undo">Undo</button>
	        <button type="button" data-action="redo">Redo</button>
	        <button type="button" data-action="save">Save</button>
	        <button type="button" data-action="export">Export</button>
        <button type="button" data-action="import">Import</button>
        <button type="button" data-action="reset">Reset</button>
      </div>
    </header>
    <section aria-label="Slash commands" class="slash">
      <input aria-label="Slash command" placeholder="/ add block" autocomplete="off" />
      <div class="menu" hidden>
        <button type="button" data-command="heading">Heading</button>
        <button type="button" data-command="paragraph">Paragraph</button>
        <button type="button" data-command="button">Button</button>
      </div>
    </section>
    <section class="document" aria-label="Canonical document blocks"></section>
    <section class="debug" aria-label="Local document JSON">
      <textarea aria-label="Document JSON"></textarea>
      <button type="button" data-action="compile">Compile preview</button>
      <pre aria-label="Compiled preview"></pre>
    </section>
  </main>
`;

const style = document.createElement('style');
style.textContent = `
  :root {
    font-family: system-ui, -apple-system, sans-serif;
    color: #172033;
    background: #fff;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
  }

  .shell {
    min-height: 100vh;
    padding: 14px;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: #4b5563;
    font-size: 13px;
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  button {
    min-height: 32px;
    padding: 6px 10px;
    border: 1px solid #d7dbe7;
    border-radius: 6px;
    background: #fff;
    color: #172033;
    cursor: pointer;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .slash {
    position: relative;
    margin-bottom: 12px;
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid #d7dbe7;
    border-radius: 6px;
    padding: 8px 10px;
  }

  .menu {
    position: absolute;
    z-index: 2;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    gap: 6px;
    padding: 6px;
    border: 1px solid #d7dbe7;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
  }

  .document {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
  }

	  .block {
	    border: 1px solid #e5e7eb;
	    border-radius: 8px;
	    padding: 10px;
	    background: #fff;
	  }

	  .block.incomplete {
	    border-color: #f59e0b;
	  }

	  .block.invalid {
	    border-color: #dc2626;
	  }

  .block header {
    margin: 0 0 8px;
  }

  .block strong {
    font-size: 13px;
  }

  .badge {
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 12px;
    background: #ecfdf5;
    color: #047857;
  }

  .badge.incomplete {
    background: #fffbeb;
    color: #b45309;
  }

	  .badge.invalid {
	    background: #fef2f2;
	    color: #b91c1c;
	  }

		  .block-footer {
		    display: flex;
		    align-items: center;
		    flex-wrap: wrap;
		    gap: 8px;
		    margin-top: 10px;
		  }

		  .target-chip {
	    overflow: hidden;
	    max-width: 220px;
	    border-radius: 999px;
	    padding: 3px 8px;
	    background: #eff6ff;
	    color: #1d4ed8;
	    font-size: 12px;
	    text-overflow: ellipsis;
	    white-space: nowrap;
		  }

		  .property-chip {
		    max-width: 180px;
		    overflow: hidden;
		    border-radius: 999px;
		    padding: 3px 8px;
		    background: #f3f4f6;
		    color: #374151;
		    font-size: 12px;
		    text-overflow: ellipsis;
		    white-space: nowrap;
		  }

		  textarea {
	    min-height: 180px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }

  pre {
    max-height: 180px;
    overflow: auto;
    margin: 8px 0 0;
    padding: 10px;
    border-radius: 8px;
    background: #f8fafc;
    font-size: 12px;
  }
`;
document.head.appendChild(style);

const status = root.querySelector<HTMLElement>('#status');
const input = root.querySelector<HTMLInputElement>('input');
const menu = root.querySelector<HTMLElement>('.menu');
const blocks = root.querySelector<HTMLElement>('.document');
const textarea = root.querySelector<HTMLTextAreaElement>('textarea');
const compiled = root.querySelector<HTMLPreElement>('pre');

if (!status || !input || !menu || !blocks || !textarea || !compiled) {
  throw new Error('Local authoring UI failed to initialize');
}

const statusEl = status;
const inputEl = input;
const menuEl = menu;
const blocksEl = blocks;
const textareaEl = textarea;
const compiledEl = compiled;

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function snapshot(): TalmehDocument {
  return structuredClone(documentState);
}

function recordChange(): void {
  undoStack.push(snapshot());
  redoStack.length = 0;
}

function undo(): void {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(snapshot());
  documentState = previous;
  render();
  setStatus('Undid change');
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(snapshot());
  documentState = next;
  render();
  setStatus('Redid change');
}

function blockStatus(block: TalmehBlock): 'ready' | 'incomplete' | 'invalid' {
  if (block.status === 'invalid') return 'invalid';
  if (block.status === 'incomplete') return 'incomplete';
  if (!block.id || !block.type) return 'invalid';
  return 'ready';
}

function moveTopLevelBlock(blockId: string, direction: BlockDirection): void {
  const blocks = moveTopLevelBlocks(documentState.blocks, blockId, direction);
  if (!blocks) return;
  recordChange();
  documentState = { ...documentState, blocks };
  render();
  sendPreviewPatch(blockId, [{ op: 'moveBlock', direction }]);
}

function reorderTopLevelBlock(blockId: string, beforeBlockId: string): void {
  const blocks = reorderTopLevelBlocks(documentState.blocks, blockId, beforeBlockId);
  if (!blocks) return;
  recordChange();
  documentState = { ...documentState, blocks };
  render();
  sendPreviewPatch(blockId, [{ op: 'reorderBlock', beforeBlockId }]);
}

function targetIdOf(block: TalmehBlock): string | null {
  if (typeof block.props['targetId'] === 'string') return block.props['targetId'];
  for (const child of block.children) {
    const targetId = targetIdOf(child);
    if (targetId) return targetId;
  }
  return null;
}

function targetLabelOf(targetId: string): string {
  const target = documentState.targets.find((item) => item.id === targetId);
  return (
    target?.fingerprint.accessibleName ??
    target?.fingerprint.stableAttributes['data-talmeh-id'] ??
    targetId
  );
}

function propertyChips(block: TalmehBlock): string {
  return Object.entries(block.props)
    .map(([name, value]) => {
      const label = `${name}: ${typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value)}`;
      return `<span class="property-chip" title="${escapeAttribute(label)}">${escapeHtml(label)}</span>`;
    })
    .join('');
}

function renderBlock(block: TalmehBlock): HTMLElement {
  const el = document.createElement('article');
  const statusValue = blockStatus(block);
  el.className = `block ${statusValue === 'ready' ? '' : statusValue}`.trim();
  el.draggable = true;
  el.dataset['blockId'] = block.id;
  const targetId = targetIdOf(block);
  const targetLabel = targetId ? targetLabelOf(targetId) : '';
  const content =
    block.content ??
    block.children
      .map((child) => child.content)
      .filter(Boolean)
      .join(' ');
  el.innerHTML = `
	    <header>
	      <strong>${escapeHtml(block.type)}</strong>
	      <span class="badge ${statusValue === 'ready' ? '' : statusValue}">${statusValue}</span>
	    </header>
		    <div>${escapeHtml(content || block.id)}</div>
		    <div class="block-footer">
		      <button type="button" data-action="move-block" data-direction="up" data-block-id="${escapeAttribute(block.id)}" aria-label="Move block up">Up</button>
		      <button type="button" data-action="move-block" data-direction="down" data-block-id="${escapeAttribute(block.id)}" aria-label="Move block down">Down</button>
		      <select data-action="transform-block" data-block-id="${escapeAttribute(block.id)}" aria-label="Transform block">
		        ${['paragraph', 'heading', 'button']
              .map(
                (type) =>
                  `<option value="${type}" ${block.type === type ? 'selected' : ''}>${type}</option>`,
              )
              .join('')}
		      </select>
		      <button type="button" data-action="target-pick" data-block-id="${escapeAttribute(block.id)}">Target</button>
		      ${propertyChips(block)}
		      ${
            targetId
              ? `<span class="target-chip" title="${escapeAttribute(targetId)}">${escapeHtml(targetLabel)}</span>`
              : ''
          }
	    </div>
	  `;
  return el;
}

function render(): void {
  blocksEl.replaceChildren(...documentState.blocks.map(renderBlock));
  textareaEl.value = exportDocument(documentState);
  setStatus(`Editing ${documentState.title}`);
}

function appendBlock(type: 'heading' | 'paragraph' | 'button'): void {
  const content =
    type === 'heading'
      ? 'Untitled heading'
      : type === 'button'
        ? 'Continue'
        : 'Write supporting copy';
  const block: TalmehBlock = {
    id: createBlockId(),
    type,
    content,
    props: {},
    status: 'ready',
    children: [],
  };
  recordChange();
  documentState = {
    ...documentState,
    blocks: [...documentState.blocks, block],
  };
  inputEl.value = '';
  slashOpen = false;
  menuEl.hidden = true;
  render();
  sendPreviewPatch(block.id, [{ op: 'insertBlock', block }]);
}

function appendPastedBlocks(blocksToAdd: TalmehBlock[]): void {
  if (!blocksToAdd.length) return;
  recordChange();
  documentState = { ...documentState, blocks: [...documentState.blocks, ...blocksToAdd] };
  render();
  setStatus('Pasted safe text');
  sendPreviewPatch(blocksToAdd[0]!.id, [{ op: 'insertBlocks', blocks: blocksToAdd }]);
}

function handleBridgeMessage(message: BridgeMessage): void {
  if (message.type !== 'target.pick.result') return;
  if (!hasBlock(documentState.blocks, message.blockId)) return;

  const targetId = createTargetId();
  const label =
    message.fingerprint.accessibleName ??
    message.fingerprint.stableAttributes['data-talmeh-id'] ??
    message.fingerprint.tagName;

  recordChange();
  documentState = {
    ...documentState,
    targets: [...documentState.targets, { id: targetId, fingerprint: message.fingerprint }],
    blocks: attachTargetToBlocks(documentState.blocks, message.blockId, targetId, label),
  };
  saveDocument(documentState);
  render();
  sendPreviewPatch(message.blockId, [
    { op: 'attachTarget', targetId, fingerprint: message.fingerprint },
  ]);
  setStatus(`Attached target ${label}`);
}

function sendPreviewPatch(blockId: string, ops: PreviewPatchOperation[]): void {
  bridge.send({
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId: LOCAL_AUTHORING_SESSION_ID,
    documentId: documentState.id,
    correlationId: createBridgeCorrelationId('preview_patch'),
    type: 'preview.patch',
    blockId,
    patch: { ops },
  });
}

inputEl.addEventListener('input', () => {
  slashOpen = inputEl.value.startsWith('/');
  menuEl.hidden = !slashOpen;
});

menuEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const command = target.dataset['command'];
  if (command === 'heading' || command === 'paragraph' || command === 'button')
    appendBlock(command);
});

root.addEventListener('paste', (event) => {
  if (event.target instanceof HTMLTextAreaElement) return;
  if (!event.clipboardData) return;
  const blocksToAdd = blocksFromSafePasteData(event.clipboardData);
  if (!blocksToAdd.length) return;
  event.preventDefault();
  appendPastedBlocks(blocksToAdd);
});

blocksEl.addEventListener('dragstart', (event) => {
  const block = (event.target as HTMLElement | null)?.closest<HTMLElement>('.block');
  draggingBlockId = block?.dataset['blockId'] ?? null;
});

blocksEl.addEventListener('dragover', (event) => {
  if (draggingBlockId) event.preventDefault();
});

blocksEl.addEventListener('drop', (event) => {
  event.preventDefault();
  const targetBlockId = (event.target as HTMLElement | null)?.closest<HTMLElement>('.block')
    ?.dataset['blockId'];
  if (draggingBlockId && targetBlockId) reorderTopLevelBlock(draggingBlockId, targetBlockId);
  draggingBlockId = null;
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.dataset['action'] !== 'transform-block') return;
  const blockId = target.dataset['blockId'];
  const type = target.value;
  if (!blockId || (type !== 'paragraph' && type !== 'heading' && type !== 'button')) return;
  recordChange();
  documentState = {
    ...documentState,
    blocks: transformBlocks(documentState.blocks, blockId, type),
  };
  render();
  sendPreviewPatch(blockId, [{ op: 'transformBlock', type }]);
});

root.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset['action'];
  if (action === 'undo') undo();
  if (action === 'redo') redo();
  if (action === 'save') {
    saveDocument(documentState);
    setStatus('Saved locally');
  }
  if (action === 'export') {
    textareaEl.value = exportDocument(documentState);
    setStatus('Exported JSON');
  }
  if (action === 'import') {
    recordChange();
    documentState = importDocument(textareaEl.value);
    saveDocument(documentState);
    render();
    sendPreviewPatch(documentState.blocks[0]?.id ?? documentState.id, [
      { op: 'replaceDocument', document: documentState },
    ]);
    setStatus('Imported JSON');
  }
  if (action === 'reset') {
    recordChange();
    resetLocalDocuments();
    documentState = baseDocument;
    compiledEl.textContent = '';
    render();
    sendPreviewPatch(documentState.blocks[0]?.id ?? documentState.id, [
      { op: 'replaceDocument', document: documentState },
    ]);
    setStatus('Reset fixture');
  }
  if (action === 'compile') {
    void compilePreview(documentState).then((doc) => {
      compiledEl.textContent = JSON.stringify(doc, null, 2);
      setStatus('Compiled preview JSON');
    });
  }
  if (action === 'target-pick') {
    const blockId = target.dataset['blockId'];
    if (!blockId) return;
    if (window.parent === window) {
      setStatus('Open authoring from the fixture host to pick targets');
      return;
    }
    setStatus('Select a product element');
    void bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: documentState.id,
          correlationId: createBridgeCorrelationId('target_pick_start'),
          type: 'target.pick.start',
          blockId,
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {
        setStatus('Target picker did not respond');
      });
  }
  if (action === 'move-block') {
    const blockId = target.dataset['blockId'];
    const direction = target.dataset['direction'];
    if (!blockId || (direction !== 'up' && direction !== 'down')) return;
    moveTopLevelBlock(blockId, direction);
  }
});

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

render();
