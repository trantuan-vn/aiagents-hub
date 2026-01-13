// Polyfill for indexedDB during SSR to prevent build errors
if (typeof window === "undefined") {
  const createMockIDBRequest = (): IDBRequest => {
    const request = {
      onsuccess: null,
      onerror: null,
      result: null,
      error: null,
      readyState: "done" as IDBRequestReadyState,
      source: null,
      transaction: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
    // Cast through unknown first to avoid type mismatch
    return request as unknown as IDBRequest;
  };

  const createMockIDBOpenDBRequest = (): IDBOpenDBRequest => {
    const request = createMockIDBRequest() as unknown as IDBOpenDBRequest;
    (request as any).onblocked = null;
    (request as any).onupgradeneeded = null;
    return request;
  };

  const mockIndexedDB = {
    open: () => createMockIDBOpenDBRequest(),
    deleteDatabase: () => createMockIDBOpenDBRequest(),
    databases: () => Promise.resolve([]),
    cmp: () => 0,
  };

  // Set indexedDB on globalThis if it doesn't exist
  if (typeof globalThis.indexedDB === "undefined") {
    (globalThis as any).indexedDB = mockIndexedDB;
  }

  // Also set on global for Node.js environments
  if (typeof global !== "undefined" && typeof (global as any).indexedDB === "undefined") {
    (global as any).indexedDB = mockIndexedDB;
  }
}
