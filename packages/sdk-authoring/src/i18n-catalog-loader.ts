import type { SupportedLocale } from '@lodariq/i18n';
import { EMPTY_AUTHORING_CATALOG, type AuthoringCatalog } from './i18n-catalog-types';

type AuthoringCatalogModule = Readonly<{ default: AuthoringCatalog }>;
type AuthoringCatalogLoader = () => Promise<AuthoringCatalogModule>;

const AUTHORING_CATALOG_LOADERS = {
  ar: () => import('./i18n-catalogs/ar'),
  de: () => import('./i18n-catalogs/de'),
  es: () => import('./i18n-catalogs/es'),
  fr: () => import('./i18n-catalogs/fr'),
  it: () => import('./i18n-catalogs/it'),
  'nl-BE': () => import('./i18n-catalogs/nl-BE'),
  pt: () => import('./i18n-catalogs/pt'),
  tr: () => import('./i18n-catalogs/tr'),
} satisfies Partial<Record<SupportedLocale, AuthoringCatalogLoader>>;

export async function loadAuthoringCatalog(locale: SupportedLocale): Promise<AuthoringCatalog> {
  const loader = AUTHORING_CATALOG_LOADERS[locale as keyof typeof AUTHORING_CATALOG_LOADERS];
  return loader ? (await loader()).default : EMPTY_AUTHORING_CATALOG;
}
