import { describe, it, expect, beforeEach } from "vitest";
import { Firestore } from "@google-cloud/firestore";
import type {
	SessionKey,
	SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";
import { FirestoreSessionStore } from "../src";

const PROJECT_ID = "test-project";
const EMULATOR_HOST = "localhost:8080";

function createEmulatorFirestore(): Firestore {
	return new Firestore({
		projectId: PROJECT_ID,
		host: "localhost",
		port: 8080,
		ssl: false,
		credentials: {
			client_email: "test@test.iam.gserviceaccount.com",
			private_key: "{}",
		},
	});
}

async function clearEmulatorData(): Promise<void> {
	await fetch(
		`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
		{ method: "DELETE" },
	);
}

describe("FirestoreSessionStore", () => {
	let db: Firestore;
	let store: FirestoreSessionStore;

	beforeEach(async () => {
		await clearEmulatorData();
		db = createEmulatorFirestore();
		store = new FirestoreSessionStore(db);
	});

	const key: SessionKey = {
		projectKey: "my-project",
		sessionId: "session-001",
	};

	const keyWithSubpath: SessionKey = {
		projectKey: "my-project",
		sessionId: "session-001",
		subpath: "subagents/agent-42",
	};

	const entry1: SessionStoreEntry = {
		type: "user",
		uuid: "uuid-aaa",
		timestamp: "2026-01-01T00:00:00Z",
		message: { role: "user", content: "hello" },
	};

	const entry2: SessionStoreEntry = {
		type: "assistant",
		uuid: "uuid-bbb",
		timestamp: "2026-01-01T00:00:01Z",
		message: { role: "assistant", content: "hi" },
	};

	const entryNoUuid: SessionStoreEntry = {
		type: "title",
		title: "My Session",
	};

	describe("load", () => {
		it("returns null for a key that was never written", async () => {
			const result = await store.load(key);
			expect(result).toBeNull();
		});
	});

	describe("append", () => {
		it("persists a single entry", async () => {
			await store.append(key, [entry1]);
			const result = await store.load(key);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(1);
			expect(result![0]).toMatchObject(entry1);
		});

		it("persists multiple entries in a batch", async () => {
			await store.append(key, [entry1, entry2]);
			const result = await store.load(key);

			expect(result).toHaveLength(2);
			expect(result![0]).toMatchObject(entry1);
			expect(result![1]).toMatchObject(entry2);
		});

		it("appends across multiple calls", async () => {
			await store.append(key, [entry1]);
			await store.append(key, [entry2]);
			const result = await store.load(key);

			expect(result).toHaveLength(2);
			expect(result![0]).toMatchObject(entry1);
			expect(result![1]).toMatchObject(entry2);
		});

		it("is a no-op for an empty entries array", async () => {
			await store.append(key, []);
			const result = await store.load(key);
			expect(result).toBeNull();
		});

		it("uses uuid as document ID for idempotent writes", async () => {
			await store.append(key, [entry1]);
			await store.append(key, [entry1]);
			const result = await store.load(key);

			expect(result).toHaveLength(1);
		});

		it("appends entries without uuid without dedup", async () => {
			await store.append(key, [entryNoUuid]);
			await store.append(key, [entryNoUuid]);
			const result = await store.load(key);

			expect(result).toHaveLength(2);
		});
	});

	describe("key isolation", () => {
		it("isolates entries by sessionId", async () => {
			const otherKey: SessionKey = {
				projectKey: "my-project",
				sessionId: "session-002",
			};

			await store.append(key, [entry1]);
			await store.append(otherKey, [entry2]);

			const result1 = await store.load(key);
			const result2 = await store.load(otherKey);

			expect(result1).toHaveLength(1);
			expect(result1![0]).toMatchObject(entry1);
			expect(result2).toHaveLength(1);
			expect(result2![0]).toMatchObject(entry2);
		});

		it("isolates entries by subpath", async () => {
			await store.append(key, [entry1]);
			await store.append(keyWithSubpath, [entry2]);

			const result1 = await store.load(key);
			const result2 = await store.load(keyWithSubpath);

			expect(result1).toHaveLength(1);
			expect(result1![0]).toMatchObject(entry1);
			expect(result2).toHaveLength(1);
			expect(result2![0]).toMatchObject(entry2);
		});
	});

	describe("round-trip fidelity", () => {
		it("preserves arbitrary extra fields on entries", async () => {
			const richEntry: SessionStoreEntry = {
				type: "assistant",
				uuid: "uuid-ccc",
				timestamp: "2026-01-01T00:00:02Z",
				message: { role: "assistant", content: "ok" },
				model: "claude-sonnet-4-6",
				costUSD: 0.003,
				nested: { deeply: { value: true } },
			};

			await store.append(key, [richEntry]);
			const result = await store.load(key);

			expect(result![0]).toMatchObject(richEntry);
		});
	});

	describe("custom collection name", () => {
		it("uses the provided collection name", async () => {
			const customStore = new FirestoreSessionStore(db, {
				collectionName: "custom_transcripts",
			});

			await customStore.append(key, [entry1]);

			const defaultResult = await store.load(key);
			expect(defaultResult).toBeNull();

			const customResult = await customStore.load(key);
			expect(customResult).toHaveLength(1);
		});
	});
});
