/**
 * Dedicated editor-origin authoring frame surface.
 *
 * The compatibility `lodariq-authoring` entry continues to export these same
 * bindings. This narrower entry lets editor.lodariq.com avoid treating the
 * customer-page host surface as part of its application entry graph.
 */
export * from './authoring/local-frame';
export * from './authoring/direct-host-services';
export * from './authoring/workflow-adapters';
