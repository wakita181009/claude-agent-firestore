import type {
	SessionKey,
	SessionStore,
	SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";
import type { Firestore, Timestamp } from "@google-cloud/firestore";
import { entryConverter } from "./converter.js";
import type { FirestoreSessionStoreOptions } from "./types.js";

export class FirestoreSessionStore implements SessionStore {
	private readonly db: Firestore;
	private readonly collectionName: string;
	private readonly entriesCollectionName: string;

	constructor(db: Firestore, options?: FirestoreSessionStoreOptions) {
		this.db = db;
		this.collectionName = options?.collectionName ?? "session_transcripts";
		this.entriesCollectionName = options?.entriesCollectionName ?? "entries";
	}

	async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
		if (entries.length === 0) return;

		const collection = this.entriesCollection(key);
		const batch = this.db.batch();

		for (const entry of entries) {
			const ref = entry.uuid ? collection.doc(entry.uuid) : collection.doc();
			batch.set(ref, { entry, createdAt: null as unknown as Timestamp });
		}

		await batch.commit();
	}

	async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
		const snapshot = await this.entriesCollection(key)
			.orderBy("createdAt", "asc")
			.get();

		if (snapshot.empty) return null;

		return snapshot.docs.map((doc) => doc.data().entry);
	}

	private buildDocId(key: SessionKey): string {
		const parts = [key.projectKey, key.sessionId];
		if (key.subpath) parts.push(key.subpath.replaceAll("/", "__"));
		return parts.join(":");
	}

	private entriesCollection(key: SessionKey) {
		return this.db
			.collection(this.collectionName)
			.doc(this.buildDocId(key))
			.collection(this.entriesCollectionName)
			.withConverter(entryConverter);
	}
}
