import {
  AuthoringMediaAssetResource as AuthoringMediaAssetResourceSchema,
  validate,
  type AuthoringMediaAssetResource,
} from '@lodariq/schema';

const LOCAL_MEDIA_DATABASE_NAME = 'lodariq-local-authoring';
const LOCAL_MEDIA_DATABASE_VERSION = 1;
const LOCAL_MEDIA_RESOURCE_STORE = 'media-asset-resources';
const LOCAL_MEDIA_BLOB_STORE = 'media-asset-blobs';

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

export async function saveLocalMediaAssetRecord(record: LocalMediaAssetRecord): Promise<void> {
  if (!hasIndexedDatabase()) return;
  const storedResource: StoredLocalMediaAssetResource = {
    id: record.resource.id,
    resource: structuredClone(record.resource),
  };
  const storedBlob: StoredLocalMediaAssetBlob = {
    id: record.resource.id,
    blob: record.blob,
  };
  await runLocalMediaWrite(storedResource, storedBlob);
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
