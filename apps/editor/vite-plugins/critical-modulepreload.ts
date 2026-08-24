import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// Rollup's types come through Vite rather than from `rollup` directly, so this
// plugin needs no dependency the application does not already have.
import type { Plugin, Rollup } from 'vite';

type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;

export interface CriticalModulePreloadOptions {
  /**
   * Substrings of module ids that must be reachable without waiting for a
   * previous request to finish. Each one is resolved to the chunk that contains
   * it, and that chunk is preloaded from the document head.
   *
   * Module ids rather than chunk names on purpose: chunk names are an artefact
   * of how Rollup happened to group things and change whenever the grouping
   * does, whereas the module is the thing the author actually means.
   */
  readonly modules: readonly string[];
}

/**
 * Emits `<link rel="modulepreload">` for the chunks on the authoring critical
 * path.
 *
 * Every stage of this boot sits behind a dynamic `import()`, so Vite can only
 * discover it at call time and issues the preload once it is already too late.
 * The result was a strictly serial chain: HTML, then entry, then application,
 * then workspace, each waiting on the round trip before it. Declaring the same
 * chunks in the document head lets the browser open all of those connections at
 * once while the entry is still being parsed.
 *
 * This costs a customer's page nothing. The markup belongs to the editor
 * origin's own document, which only ever loads inside the authoring iframe, and
 * that iframe is created in response to a creator gesture — never on page view.
 *
 * A module that cannot be found fails the build. A preload that silently stops
 * matching is worse than none: the chain quietly re-serialises and the trace
 * looks like a regression with no cause.
 */
/** Where the plugin records what each marker resolved to, for the size gate. */
export const CRITICAL_MODULEPRELOAD_MANIFEST = '.vite/critical-modulepreload.json';

export function criticalModulePreload(options: CriticalModulePreloadOptions): Plugin {
  const resolved: Record<string, string> = {};

  return {
    name: 'lodariq:critical-modulepreload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const bundle = context.bundle;
        if (!bundle) return html;
        const hrefs = options.modules.map((marker) => {
          const chunk = findChunkContaining(bundle, marker);
          if (!chunk) {
            throw new Error(
              `[critical-modulepreload] no chunk contains a module matching "${marker}". ` +
                'The critical path changed shape — update the marker or the boot sequence, ' +
                'because the preload it was standing in for is now silently gone.',
            );
          }
          resolved[marker] = chunk.fileName;
          return `/${chunk.fileName}`;
        });

        return {
          html,
          tags: hrefs.map((href) => ({
            tag: 'link',
            attrs: { rel: 'modulepreload', href, crossorigin: '' },
            injectTo: 'head' as const,
          })),
        };
      },
    },
    /**
     * Written from `writeBundle`, which runs after the HTML transform, so the
     * size gate checks the same resolution the document actually received
     * rather than guessing which chunk a marker meant from a name Rollup chose.
     */
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir;
      if (!outDir) return;
      const target = join(outDir, CRITICAL_MODULEPRELOAD_MANIFEST);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(resolved, null, 2)}\n`);
    },
  };
}

function findChunkContaining(bundle: OutputBundle, marker: string): OutputChunk | null {
  const chunks = Object.values(bundle).filter(
    (output): output is OutputChunk => output.type === 'chunk',
  );
  // Entry chunks are already loaded by the document's own script tag; preloading
  // one again would only duplicate a request the parser has made.
  const matches = chunks.filter(
    (chunk) => !chunk.isEntry && chunk.moduleIds.some((id) => id.includes(marker)),
  );
  if (matches.length === 0) return null;
  // The largest match is the chunk the module's weight actually lives in; a
  // marker that grazes a small re-export chunk would preload the wrong thing.
  return matches.reduce((largest, chunk) =>
    chunk.code.length > largest.code.length ? chunk : largest,
  );
}
