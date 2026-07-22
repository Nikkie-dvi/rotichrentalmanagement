// Custom notification tones stored in IndexedDB as Blobs.
// Keeps the audio out of localStorage (5MB cap) and out of the git repo.

const DB_NAME = "bomahut-sounds";
const STORE = "tones";
const LS_SELECTED = "bomahut.notif.tone";
const LS_ENABLED = "bomahut.notif.sound.enabled";

export type ToneRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  blob: Blob;
};

export type ToneMeta = Omit<ToneRecord, "blob">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function listTones(): Promise<ToneMeta[]> {
  try {
    const all = await tx<ToneRecord[]>("readonly", (s) => s.getAll() as IDBRequest<ToneRecord[]>);
    return all
      .map(({ blob, ...meta }) => meta)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function addTone(file: File): Promise<ToneMeta> {
  const id = crypto.randomUUID();
  const rec: ToneRecord = {
    id,
    name: file.name.replace(/\.[^.]+$/, ""),
    type: file.type || "audio/mpeg",
    size: file.size,
    createdAt: Date.now(),
    blob: file,
  };
  await tx("readwrite", (s) => s.put(rec));
  const { blob, ...meta } = rec;
  return meta;
}

export async function deleteTone(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  if (getSelectedToneId() === id) setSelectedToneId(null);
}

export async function getToneBlob(id: string): Promise<Blob | null> {
  try {
    const rec = await tx<ToneRecord | undefined>("readonly", (s) => s.get(id) as IDBRequest<ToneRecord | undefined>);
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export function getSelectedToneId(): string | null {
  try {
    return localStorage.getItem(LS_SELECTED);
  } catch {
    return null;
  }
}

export function setSelectedToneId(id: string | null) {
  try {
    if (id) localStorage.setItem(LS_SELECTED, id);
    else localStorage.removeItem(LS_SELECTED);
  } catch {}
}

export function isSoundEnabled() {
  try {
    return localStorage.getItem(LS_ENABLED) !== "0";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(LS_ENABLED, enabled ? "1" : "0");
  } catch {}
}

let cachedUrl: { id: string; url: string } | null = null;

async function getSelectedToneUrl(): Promise<string | null> {
  const id = getSelectedToneId();
  if (!id) return null;
  if (cachedUrl && cachedUrl.id === id) return cachedUrl.url;
  if (cachedUrl) URL.revokeObjectURL(cachedUrl.url);
  const blob = await getToneBlob(id);
  if (!blob) {
    cachedUrl = null;
    return null;
  }
  const url = URL.createObjectURL(blob);
  cachedUrl = { id, url };
  return url;
}

export async function playSelectedTone(): Promise<void> {
  if (!isSoundEnabled()) return;
  const url = await getSelectedToneUrl();
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 1;
    await audio.play().catch(() => {});
  } catch {}
}

export async function previewTone(id: string): Promise<void> {
  const blob = await getToneBlob(id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(() => URL.revokeObjectURL(url));
}
