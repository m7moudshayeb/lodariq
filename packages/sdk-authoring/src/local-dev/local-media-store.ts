import {
  AUTHORING_RESOURCE_LIMITS,
  AuthoringMediaAssetResource as AuthoringMediaAssetResourceSchema,
  validate,
  type AuthoringMediaAssetResource,
} from '@lodariq/schema';

const LOCAL_MEDIA_DATABASE_NAME = 'lodariq-local-authoring';
const LOCAL_MEDIA_DATABASE_VERSION = 1;
const LOCAL_MEDIA_RESOURCE_STORE = 'media-asset-resources';
const LOCAL_MEDIA_BLOB_STORE = 'media-asset-blobs';
const LOCAL_MEDIA_STORAGE_HEADROOM_BYTES = 2_097_152;

export interface LocalMediaAssetRecord {
  blob: Blob;
  resource: AuthoringMediaAssetResource;
}

interface StoredLocalMediaAssetResource {
  id: string;
  resource: AuthoringMediaAssetResource;
}

interface StoredLocalMediaAssetBlob {
  blob: Blob;
  id: string;
}

export async function loadLocalMediaAssetResources(): Promise<AuthoringMediaAssetResource[]> {
  if (!hasIndexedDatabase()) return [];
  const records = await runLocalMediaRead(LOCAL_MEDIA_RESOURCE_STORE, (store) => store.getAll());
  return (records as unknown[])
    .filter(isStoredLocalMediaAssetResource)
    .map(({ resource }) => structuredClone(resource));
}

export async function loadLocalMediaAssetBlob(assetId: string): Promise<Blob | null> {
  if (!hasIndexedDatabase()) return null;
  const record = await runLocalMediaRead(LOCAL_MEDIA_BLOB_STORE, (store) => store.get(assetId));
  if (!isStoredLocalMediaAssetBlob(record) || record.id !== assetId) return null;
  return record.blob;
}

const localMediaPreviewUrls = new Map<string, string>();

export async function resolveLocalMediaAssetUrl(assetId: string): Promise<string | null> {
  const cached = localMediaPreviewUrls.get(assetId);
  if (cached) return cached;
  const blob = await loadLocalMediaAssetBlob(assetId);
  if (!blob || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(blob);
  localMediaPreviewUrls.set(assetId, url);
  return url;
}

export async function saveLocalMediaAssetRecord(record: LocalMediaAssetRecord): Promise<void> {
  assertValidLocalMediaAssetRecord(record);
  if (!hasIndexedDatabase()) return;
  await assertLocalMediaStorageCapacity(record.blob.size);
  const storedResource: StoredLocalMediaAssetResource = {
    id: record.resource.id,
    resource: structuredClone(record.resource),
  };
  const storedBlob: StoredLocalMediaAssetBlob = {
    id: record.resource.id,
    blob: record.blob,
  };
  try {
    await runLocalMediaWrite(storedResource, storedBlob);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error('This browser does not have enough local storage for that media file.');
    }
    throw error;
  }
}

function assertValidLocalMediaAssetRecord(record: LocalMediaAssetRecord): void {
  const validation = validate(AuthoringMediaAssetResourceSchema, record.resource);
  if (!validation.valid) {
    throw new Error('The media file does not meet the supported upload requirements.');
  }
  if (record.blob.size !== record.resource.byteLength) {
    throw new Error('The saved media file is incomplete. Please upload it again.');
  }
  if (record.blob.size > AUTHORING_RESOURCE_LIMITS.assetBytes) {
    throw new Error(localMediaFileSizeMessage());
  }
}

async function assertLocalMediaStorageCapacity(requiredBytes: number): Promise<void> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) return;
  const estimate = await storage.estimate();
  if (estimate.quota === undefined || estimate.usage === undefined) return;
  const availableBytes = Math.max(0, estimate.quota - estimate.usage);
  if (availableBytes >= requiredBytes + LOCAL_MEDIA_STORAGE_HEADROOM_BYTES) return;
  throw new Error('This browser does not have enough local storage for that media file.');
}

function localMediaFileSizeMessage(): string {
  const maxMegabytes = AUTHORING_RESOURCE_LIMITS.assetBytes / 1_048_576;
  return `Media files must be ${maxMegabytes} MB or smaller.`;
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

function hasIndexedDatabase(): boolean {
  return typeof globalThis.indexedDB !== 'undefined';
}

async function runLocalMediaRead(
  storeName: string,
  createRequest: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  const database = await openLocalMediaDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = createRequest(transaction.objectStore(storeName));
    let result: unknown;

    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Local media transaction was aborted'));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Local media transaction failed'));
    };
  });
}

async function runLocalMediaWrite(
  resource: StoredLocalMediaAssetResource,
  blob: StoredLocalMediaAssetBlob,
): Promise<void> {
  const database = await openLocalMediaDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [LOCAL_MEDIA_RESOURCE_STORE, LOCAL_MEDIA_BLOB_STORE],
      'readwrite',
    );
    transaction.objectStore(LOCAL_MEDIA_RESOURCE_STORE).put(resource);
    transaction.objectStore(LOCAL_MEDIA_BLOB_STORE).put(blob);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Local media transaction was aborted'));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Local media transaction failed'));
    };
  });
}

function openLocalMediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(
      LOCAL_MEDIA_DATABASE_NAME,
      LOCAL_MEDIA_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      for (const storeName of [LOCAL_MEDIA_RESOURCE_STORE, LOCAL_MEDIA_BLOB_STORE]) {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Local media storage is unavailable'));
    request.onblocked = () => reject(new Error('Local media storage upgrade is blocked'));
  });
}

function isStoredLocalMediaAssetResource(value: unknown): value is StoredLocalMediaAssetResource {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredLocalMediaAssetResource>;
  if (!candidate.resource) return false;
  const validation = validate(AuthoringMediaAssetResourceSchema, candidate.resource);
  return validation.valid && candidate.id === validation.value.id;
}

function isStoredLocalMediaAssetBlob(value: unknown): value is StoredLocalMediaAssetBlob {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredLocalMediaAssetBlob>;
  return typeof candidate.id === 'string' && isBlobLike(candidate.blob);
}

function isBlobLike(value: unknown): value is Blob {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Blob>;
  return (
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string' &&
    typeof candidate.slice === 'function'
  );
}
