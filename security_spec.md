# Security Specification & Payload-First Security TDD

## 1. Data Invariants
1. **Unauthenticated Deny**: Unauthenticated requests (`request.auth == null`) cannot read, list, create, update, or delete any user profile, knowledge library, folder, document, page, or chunk.
2. **Verified Identity**: All writes require `request.auth.token.email_verified == true`.
3. **Strict Ownership**: Every library, folder, document, page, and chunk carries `userId == request.auth.uid`.
4. **Master Gate Relational Sync**: Every subcollection (`folders`, `documents`, `pages`, `chunks`) verifies via `get()` that the parent `/libraries/{libraryId}` exists and belongs to `request.auth.uid`.
5. **No Cross-Owner Queries**: Every `allow list` rule strictly evaluates `resource.data.userId == request.auth.uid` with zero `get()`/`exists()` lookups inside `allow list`.
6. **Immutable Ownership & Timestamps**: `userId`, `libraryId`, `folderId` (ID), `documentId`, and `createdAt` cannot be modified after creation. `createdAt == request.time` on create and `updatedAt == request.time` on create/update.
7. **Strict Key Allowlisting & Size Bounds**: Every create validates `hasAll` and `hasOnly` keys, string lengths (`name <= 120`, `description <= 400`, `folder.name <= 80`, `filename <= 180`), and `isValidId()` regex guards (`^[a-zA-Z0-9_\-]+$`, `size() <= 128`). Every update uses `affectedKeys().hasOnly(...)` in action-based branches wrapped by `isValid[Entity](incoming())`.
8. **PII Isolation**: User email is stored only on `/users/{userId}` where `allow get` is restricted to `request.auth.uid == userId` and `allow list` is `false`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Library Read/Create**: `auth: null`, `GET /libraries/lib_1` or `CREATE /libraries/lib_1` -> `PERMISSION_DENIED`.
2. **Cross-User Library Spoof**: Signed in as `userB`, create `/libraries/lib_1` with `userId: "userA"` -> `PERMISSION_DENIED`.
3. **Shadow Ghost Field Injection**: Signed in as `userA`, create `/libraries/lib_1` with extra key `isAdmin: true` -> `PERMISSION_DENIED` (`hasOnly` blocks shadow fields).
4. **Unverified Email Write**: Signed in with `email_verified: false`, create `/libraries/lib_1` -> `PERMISSION_DENIED`.
5. **ID Poisoning Attack**: Create `/libraries/../../evil` or 200-char libraryId -> `PERMISSION_DENIED` (`isValidId` rejects).
6. **Client Timestamp Forgery**: Create `/libraries/lib_1` with `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` -> `PERMISSION_DENIED` (`== request.time`).
7. **Orphaned Folder Injection**: Signed in as `userA`, create `/libraries/lib_owned_by_userB/folders/fld_1` with `userId: "userA"` -> `PERMISSION_DENIED` (Master Gate `get()` on parent library fails).
8. **Cross-Library Document Move**: Move document with `affectedKeys` modifying `libraryId` or `userId` -> `PERMISSION_DENIED`.
9. **Blanket List Query Scraping**: Query `collection(db, 'libraries')` without `where('userId', '==', uid)` -> `PERMISSION_DENIED`.
10. **PII User Enumeration**: Query `collection(db, 'users')` or `GET /users/userB` as `userA` -> `PERMISSION_DENIED`.
11. **Oversized Embedding / Payload Exhaustion**: Create chunk with `embedding` array size 5000 or string > 10000 chars -> `PERMISSION_DENIED`.
12. **Terminal Document State Bypass**: Attempt to change a `ready` document's `status` back to `uploading` -> `PERMISSION_DENIED`.
