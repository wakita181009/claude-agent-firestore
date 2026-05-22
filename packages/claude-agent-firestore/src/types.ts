import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import type { Timestamp } from "@google-cloud/firestore";

export interface FirestoreSessionStoreOptions {
	collectionName?: string;
	entriesCollectionName?: string;
}

export interface EntryDocument {
	entry: SessionStoreEntry;
	createdAt: Timestamp;
}
