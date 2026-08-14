const COMPILER_VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

/** Compiler provenance must be bounded SemVer, but need not equal this build. */
export function isValidCompilerVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    COMPILER_VERSION_PATTERN.test(value)
  );
}
