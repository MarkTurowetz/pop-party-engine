export interface BrowserWorkspaceCheckpoint {
  schemaVersion: number;
  gameId: string;
  workingRevision: string;
  gitContentRevision: string;
  gitReleaseRevision: string;
  savedAt: string;
  manifest: Record<string, unknown>;
  files: Record<string, string>;
}

export interface WorkspaceCheckpointStore {
  read(): Promise<BrowserWorkspaceCheckpoint | null>;
  write(checkpoint: BrowserWorkspaceCheckpoint): Promise<void>;
  clear(): Promise<void>;
}

interface StoredCheckpoint {
  key: string;
  checkpoint: BrowserWorkspaceCheckpoint;
}

const DATABASE_NAME = "pop-party-authoring";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace-checkpoints";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      reject(request.error || new Error("IndexedDB request failed"));
    });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => {
      reject(transaction.error || new Error("IndexedDB transaction was aborted"));
    });
    transaction.addEventListener("error", () => {
      reject(transaction.error || new Error("IndexedDB transaction failed"));
    });
  });
}

async function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "key" });
    }
  });
  return requestResult(request);
}

function checkpointKey(win: Window): string {
  const origin = win.location?.origin || "local";
  return `${origin}:default-workspace`;
}

export function createWorkspaceCheckpointStore(win: Window = window): WorkspaceCheckpointStore {
  const key = checkpointKey(win);

  async function database(): Promise<IDBDatabase> {
    if (!win.indexedDB) {
      throw new Error(
        "This browser does not support local workspace checkpoints. Git sync was not started."
      );
    }
    return openDatabase(win.indexedDB);
  }

  return {
    async read() {
      const db = await database();
      try {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const stored = await requestResult(
          transaction.objectStore(STORE_NAME).get(key) as IDBRequest<StoredCheckpoint | undefined>
        );
        await transactionComplete(transaction);
        return stored?.checkpoint || null;
      } finally {
        db.close();
      }
    },
    async write(checkpoint) {
      const db = await database();
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put({ key, checkpoint } satisfies StoredCheckpoint);
        await transactionComplete(transaction);
      } finally {
        db.close();
      }
    },
    async clear() {
      const db = await database();
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(key);
        await transactionComplete(transaction);
      } finally {
        db.close();
      }
    }
  };
}
