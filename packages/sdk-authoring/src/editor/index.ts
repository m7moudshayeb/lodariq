/**
 * Lodariq editor boundary on top of Lexical (PRD §7.2).
 *
 * This directory (`packages/sdk-authoring/src/editor`) is the ONLY source area
 * allowed to import `lexical` / `@lexical/*`. Enforced by package separation,
 * dependency-cruiser, and ESLint (PRD §7.2, §20).
 *
 * This barrel is the public shape of that boundary. It is deliberately NOT the
 * way the authoring frame reaches into it: `export *` over the Rich Content
 * editor means one named import pulls the whole editor, its plugins and the
 * `lucide-react` icon map into whatever chunk asked. Callers inside the frame
 * import the specific module they need — `./ids`, `./paste`, `./serialize`,
 * `./create-editor` — so that only the editor's own chunk carries Lexical's
 * weight.
 */
export { createLodariqEditor } from './create-editor';
export * from './ids';
export * from './nodes';
export * from './paste';
export * from './rich-content-editor';
export * from './serialize';
