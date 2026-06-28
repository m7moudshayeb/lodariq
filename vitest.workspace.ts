import { defineWorkspace } from 'vitest/config';

// All tests live in the centralized @talmeh/tests package, mirroring the source
// path of the package under test (packages/tests/<pkg>/src/...).
export default defineWorkspace(['packages/tests']);
