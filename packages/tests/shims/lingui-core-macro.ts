type MessageDefinition = Readonly<{
  id: string;
  message?: string;
  comment?: string;
}>;

/**
 * Vitest reads dashboard message descriptors without running Next's Lingui
 * compiler. Production builds still use the real macro; tests only need the
 * descriptor unchanged so server-action source messages remain assertable.
 */
export function msg<const Definition extends MessageDefinition>(
  definition: Definition,
): Definition {
  return definition;
}
