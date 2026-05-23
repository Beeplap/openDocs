"use client";

const DB_NAME = "opendocs-pending-files";
const STORE_NAME = "pending";
const DB_VERSION = 1;

export type PendingFileTarget = "pdf-editor";

type PendingRecord = {
  target: PendingFileTarget;
  files: File[];
  createdAt: number;
};

function openPendingFilesDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "target" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open pending files database"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Pending files transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Pending files transaction aborted"));
  });
}

export async function savePendingFiles(target: PendingFileTarget, fileList: FileList | File[]) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  const db = await openPendingFilesDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ target, files, createdAt: Date.now() } satisfies PendingRecord);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function takePendingFiles(target: PendingFileTarget) {
  const db = await openPendingFilesDb();
  try {
    const readTransaction = db.transaction(STORE_NAME, "readonly");
    const readRequest = readTransaction.objectStore(STORE_NAME).get(target);
    const record = await new Promise<PendingRecord | undefined>((resolve, reject) => {
      readRequest.onsuccess = () => resolve(readRequest.result as PendingRecord | undefined);
      readRequest.onerror = () => reject(readRequest.error ?? new Error("Could not read pending files"));
    });
    await transactionDone(readTransaction);

    const writeTransaction = db.transaction(STORE_NAME, "readwrite");
    writeTransaction.objectStore(STORE_NAME).delete(target);
    await transactionDone(writeTransaction);

    return record?.files ?? [];
  } finally {
    db.close();
  }
}
