# claude-agent-firestore

[![CI](https://github.com/wakita181009/claude-agent-firestore/actions/workflows/ci.yml/badge.svg)](https://github.com/wakita181009/claude-agent-firestore/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/claude-agent-firestore)](https://www.npmjs.com/package/claude-agent-firestore)
[![codecov](https://codecov.io/gh/wakita181009/claude-agent-firestore/branch/main/graph/badge.svg)](https://codecov.io/gh/wakita181009/claude-agent-firestore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Firestore-backed `SessionStore` implementation for the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

Persists session transcripts to Google Cloud Firestore, enabling session resume across container restarts, serverless invocations, and multi-instance deployments.

## Install

```bash
npm install claude-agent-firestore @google-cloud/firestore @anthropic-ai/claude-agent-sdk
```

Both `@google-cloud/firestore` and `@anthropic-ai/claude-agent-sdk` are **peer dependencies** — you provide your own versions.

## Usage

```typescript
import { Firestore } from "@google-cloud/firestore";
import { startup } from "@anthropic-ai/claude-agent-sdk";
import { FirestoreSessionStore } from "claude-agent-firestore";

const db = new Firestore({ projectId: "my-gcp-project" });
const sessionStore = new FirestoreSessionStore(db);

await startup({
  sessionStore,
  // ...other options
});
```

### Custom collection names

```typescript
const sessionStore = new FirestoreSessionStore(db, {
  collectionName: "my_transcripts",      // default: "session_transcripts"
  entriesCollectionName: "my_entries",   // default: "entries"
});
```

## Firestore schema

```
session_transcripts/{projectKey}:{sessionId}[:{subpath}]
  └── entries/{uuid | auto-id}
        ├── entry: SessionStoreEntry   (opaque SDK payload)
        ├── createdAt: Timestamp       (server-generated, used for ordering)
        └── idx: number                (position within the append call; breaks createdAt ties)
```

- Document ID under `session_transcripts/` is a composite key from `SessionKey` fields
- `entries` subcollection stores individual transcript entries in insertion order
- Entries with a `uuid` use it as the document ID for idempotent writes
- Entries without a `uuid` (titles, tags, mode markers) get auto-generated IDs
- Entries in one `append` batch share a single server timestamp; `idx` preserves their in-batch order (documents written before `idx` existed keep their `createdAt` order)

## API

### `FirestoreSessionStore`

Implements the SDK's `SessionStore` interface with two methods:

| Method | Description |
|--------|-------------|
| `append(key, entries)` | Batched `set` into the entries subcollection, chunked at Firestore's 500-writes-per-batch limit |
| `load(key)` | Paginated `orderBy('createdAt', 'asc')` query (1000 entries per page), with `idx` breaking same-timestamp ties |

### `FirestoreSessionStoreOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `collectionName` | `string` | `"session_transcripts"` | Top-level Firestore collection |
| `entriesCollectionName` | `string` | `"entries"` | Subcollection for transcript entries |

## Development

### Prerequisites

- Node.js >= 22
- pnpm
- [Firestore emulator](https://cloud.google.com/firestore/docs/emulator) (for tests)

### Setup

```bash
pnpm install
```

### Commands

```bash
pnpm build        # TypeScript → dist/
pnpm test         # vitest (requires Firestore emulator on localhost:8080)
pnpm test:coverage # vitest with coverage
pnpm typecheck    # tsc --noEmit
pnpm check        # biome lint & format
```

### Running tests locally

Start the Firestore emulator, then run the tests:

```bash
gcloud emulators firestore start --host-port=localhost:8080 --project=test-project &
pnpm test
```

## License

[MIT](LICENSE)
