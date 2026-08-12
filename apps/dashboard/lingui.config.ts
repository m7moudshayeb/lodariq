import { defineConfig } from '@lingui/cli';
import {
  DEFAULT_LOCALE,
  EXPANDED_PSEUDO_LOCALE,
  PRODUCT_LOCALES,
} from '../../packages/i18n/src/index';

export default defineConfig({
  sourceLocale: DEFAULT_LOCALE,
  // ar-XB is a runtime alias of the generated expanded catalog. Keeping a
  // single Lingui pseudo locale avoids an empty second translation catalog
  // while ar-XB still drives the document's RTL direction.
  locales: [...PRODUCT_LOCALES, EXPANDED_PSEUDO_LOCALE],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['<rootDir>/src'],
      exclude: ['<rootDir>/src/locales/**'],
    },
  ],
  compileNamespace: 'ts',
  pseudoLocale: {
    locale: EXPANDED_PSEUDO_LOCALE,
    prepend: '⟦',
    append: '⟧',
    extend: 0.35,
  },
  fallbackLocales: {
    default: DEFAULT_LOCALE,
    [EXPANDED_PSEUDO_LOCALE]: DEFAULT_LOCALE,
  },
});
