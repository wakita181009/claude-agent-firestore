import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import type {
  FirestoreDataConverter,
  Timestamp,
} from "@google-cloud/firestore";
import { FieldValue } from "@google-cloud/firestore";
import type { EntryDocument } from "./types.js";

export const entryConverter: FirestoreDataConverter<EntryDocument> = {
  toFirestore(doc: EntryDocument) {
    return {
      entry: doc.entry,
      createdAt: FieldValue.serverTimestamp(),
    };
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      entry: data.entry as SessionStoreEntry,
      createdAt: data.createdAt as Timestamp,
    };
  },
};
