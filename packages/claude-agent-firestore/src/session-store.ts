import type {
  SessionKey,
  SessionStore,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  Firestore,
  QueryDocumentSnapshot,
  Timestamp,
} from "@google-cloud/firestore";
import { entryConverter } from "./converter.js";
import type { EntryDocument, FirestoreSessionStoreOptions } from "./types.js";

export const DEFAULT_COLLECTION_NAME = "session_transcripts";
export const DEFAULT_ENTRIES_COLLECTION_NAME = "entries";

// Firestore rejects a batched write above 500 operations.
const MAX_BATCH_WRITES = 500;
// Bounds each query so large transcripts stay under Firestore's server-side
// query deadline — an unbounded single-query load hit gRPC 14 "Query timed
// out" at ~20k entries.
const LOAD_PAGE_SIZE = 1000;

// toMillis() floors sub-millisecond precision, so ordering decisions must
// compare at full precision.
function compareCreatedAt(a: Timestamp, b: Timestamp): number {
  return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
}

export function buildDocId(key: SessionKey): string {
  const parts = [key.projectKey, key.sessionId];
  if (key.subpath) parts.push(key.subpath.replaceAll("/", "__"));
  return parts.join(":");
}

export class FirestoreSessionStore implements SessionStore {
  private readonly db: Firestore;
  private readonly collectionName: string;
  private readonly entriesCollectionName: string;

  constructor(db: Firestore, options?: FirestoreSessionStoreOptions) {
    this.db = db;
    this.collectionName = options?.collectionName ?? DEFAULT_COLLECTION_NAME;
    this.entriesCollectionName =
      options?.entriesCollectionName ?? DEFAULT_ENTRIES_COLLECTION_NAME;
  }

  async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const collection = this.entriesCollection(key);

    for (let i = 0; i < entries.length; i += MAX_BATCH_WRITES) {
      const batch = this.db.batch();
      for (const [j, entry] of entries
        .slice(i, i + MAX_BATCH_WRITES)
        .entries()) {
        const ref = entry.uuid ? collection.doc(entry.uuid) : collection.doc();
        batch.set(ref, {
          entry,
          createdAt: null as unknown as Timestamp,
          idx: i + j,
        });
      }
      await batch.commit();
    }
  }

  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    const query = this.entriesCollection(key)
      .orderBy("createdAt", "asc")
      .limit(LOAD_PAGE_SIZE);

    const docs: EntryDocument[] = [];
    let last: QueryDocumentSnapshot<EntryDocument> | undefined;
    for (;;) {
      const snapshot = await (last === undefined
        ? query
        : query.startAfter(last)
      ).get();
      for (const doc of snapshot.docs) docs.push(doc.data());
      if (snapshot.size < LOAD_PAGE_SIZE) break;
      last = snapshot.docs.at(-1);
    }
    if (docs.length === 0) return null;

    // Same-batch entries share one serverTimestamp and their doc-id tiebreak
    // is arbitrary; idx restores append order. Legacy documents read as idx 0
    // and keep query order (the sort is stable).
    docs.sort(
      (a, b) => compareCreatedAt(a.createdAt, b.createdAt) || a.idx - b.idx,
    );

    return docs.map((doc) => doc.entry);
  }

  private entriesCollection(key: SessionKey) {
    return this.db
      .collection(this.collectionName)
      .doc(buildDocId(key))
      .collection(this.entriesCollectionName)
      .withConverter(entryConverter);
  }
}
