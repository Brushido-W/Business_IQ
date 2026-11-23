import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import {
  AskResponse,
  DocumentChunk,
  DocumentDetail,
  DocumentFileType,
  DocumentPage,
  DocumentRecord,
  DocumentStatus,
  Folder,
  KnowledgeLibrary,
  UserProfile,
} from '../types/knowledge.ts';
import {
  checkFirebaseStorageAvailable,
  db,
  handleFirestoreError,
  OperationType,
  storage,
} from './firebase.ts';
import { api } from './api.ts';

function timestampToIso(val: unknown): string {
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as Timestamp).toDate === 'function'
  ) {
    return (val as Timestamp).toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw.slice(0, 12)}`;
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || 'document.txt';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^a-zA-Z0-9._\-\s()]/g, '_')
    .trim();
  return cleaned.slice(0, 180) || 'document.txt';
}

export function detectFileType(filename: string): DocumentFileType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.md')) return 'md';
  return null;
}

function mapLibraryDoc(id: string, data: Record<string, unknown>): KnowledgeLibrary {
  return {
    id,
    libraryId: (data.libraryId as string) || id,
    userId: (data.userId as string) || '',
    name: (data.name as string) || 'Untitled Library',
    description: (data.description as string) || '',
    vectorStoreId: (data.vectorStoreId as string) || `vs_biq_${id}`,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function mapFolderDoc(id: string, data: Record<string, unknown>): Folder {
  return {
    id,
    folderId: (data.folderId as string) || id,
    libraryId: (data.libraryId as string) || '',
    userId: (data.userId as string) || '',
    name: (data.name as string) || 'Untitled Folder',
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function mapDocumentDoc(
  id: string,
  data: Record<string, unknown>,
  libraryName = '',
  folderName = 'Unfiled'
): DocumentRecord {
  return {
    id,
    documentId: (data.documentId as string) || id,
    libraryId: (data.libraryId as string) || '',
    folderId: (data.folderId as string | null) ?? null,
    userId: (data.userId as string) || '',
    libraryName,
    folderName,
    filename: (data.filename as string) || 'Untitled',
    fileType: (data.fileType as DocumentFileType) || 'txt',
    mimeType: (data.mimeType as string) || 'application/octet-stream',
    sizeBytes: Number(data.sizeBytes || 0),
    pageCount: Number(data.pageCount || 0),
    storagePath: (data.storagePath as string | null) ?? null,
    downloadUrl: (data.downloadUrl as string | null) ?? null,
    storageUploaded: Boolean(data.storageUploaded),
    providerFileId: (data.providerFileId as string) || `file_biq_${id}`,
    vectorStoreId: (data.vectorStoreId as string) || '',
    status: (data.status as DocumentStatus) || 'processing',
    errorMessage: (data.errorMessage as string | null) ?? null,
    chunkCount: Number(data.chunkCount || 0),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

// --- User Profile ---

export async function ensureUserProfile(user: {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        userId: user.uid,
        displayName: (data.displayName as string) || user.displayName || 'Operator',
        email: (data.email as string | null) ?? user.email,
        photoURL: (data.photoURL as string | null) ?? user.photoURL,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt),
      };
    }

    const displayName = (user.displayName || user.email?.split('@')[0] || 'Operator').slice(0, 60);
    await setDoc(ref, {
      userId: user.uid,
      displayName,
      email: user.email || null,
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      userId: user.uid,
      displayName,
      email: user.email,
      photoURL: user.photoURL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserDisplayName(userId: string, displayName: string): Promise<void> {
  const cleaned = displayName.trim().slice(0, 60);
  if (!cleaned) {
    throw new Error('Display name cannot be empty.');
  }
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      displayName: cleaned,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Knowledge Libraries ---

export async function fetchLibraryCounts(
  userId: string,
  libraries: KnowledgeLibrary[]
): Promise<KnowledgeLibrary[]> {
  const enriched = await Promise.all(
    libraries.map(async (lib) => {
      try {
        const [docsSnap, foldersSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'libraries', lib.id, 'documents'),
              where('userId', '==', userId)
            )
          ),
          getDocs(
            query(
              collection(db, 'libraries', lib.id, 'folders'),
              where('userId', '==', userId)
            )
          ),
        ]);
        const docs = docsSnap.docs.map((d) => d.data());
        return {
          ...lib,
          documentCount: docs.length,
          readyDocumentCount: docs.filter((d) => d.status === 'ready').length,
          processingDocumentCount: docs.filter(
            (d) => d.status === 'processing' || d.status === 'uploading'
          ).length,
          folderCount: foldersSnap.size,
        };
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, `libraries/${lib.id}/documents`);
      }
    })
  );
  return enriched.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function subscribeLibraries(
  userId: string,
  onLibraries: (libs: KnowledgeLibrary[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'libraries'), where('userId', '==', userId));
  return onSnapshot(
    q,
    async (snapshot) => {
      const baseLibs = snapshot.docs.map((d) =>
        mapLibraryDoc(d.id, d.data() as Record<string, unknown>)
      );
      try {
        const enriched = await fetchLibraryCounts(userId, baseLibs);
        onLibraries(enriched);
      } catch (err) {
        onError(err instanceof Error ? err : new Error('Failed to load library metrics.'));
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'libraries');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function listLibrariesOnce(userId: string): Promise<KnowledgeLibrary[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'libraries'), where('userId', '==', userId))
    );
    const baseLibs = snap.docs.map((d) =>
      mapLibraryDoc(d.id, d.data() as Record<string, unknown>)
    );
    return await fetchLibraryCounts(userId, baseLibs);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'libraries');
  }
}

export async function createLibrary(
  userId: string,
  payload: { name: string; description: string }
): Promise<KnowledgeLibrary> {
  const name = payload.name.trim();
  const description = payload.description.trim();
  if (!name || name.length > 120) {
    throw new Error('Library name must be between 1 and 120 characters.');
  }
  if (description.length > 400) {
    throw new Error('Description must be 400 characters or fewer.');
  }

  const libraryId = makeId('lib');
  const vectorStoreId = `vs_biq_${libraryId}`;
  const path = `libraries/${libraryId}`;

  try {
    await setDoc(doc(db, 'libraries', libraryId), {
      libraryId,
      userId,
      name,
      description,
      vectorStoreId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const createdSnap = await getDoc(doc(db, 'libraries', libraryId));
    if (!createdSnap.exists()) {
      throw new Error('Firestore did not confirm library creation.');
    }
    return {
      ...mapLibraryDoc(libraryId, createdSnap.data() as Record<string, unknown>),
      documentCount: 0,
      readyDocumentCount: 0,
      processingDocumentCount: 0,
      folderCount: 0,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateLibrary(
  libraryId: string,
  payload: { name: string; description: string }
): Promise<KnowledgeLibrary> {
  const name = payload.name.trim();
  const description = payload.description.trim();
  if (!name || name.length > 120) {
    throw new Error('Library name must be between 1 and 120 characters.');
  }
  if (description.length > 400) {
    throw new Error('Description must be 400 characters or fewer.');
  }

  const path = `libraries/${libraryId}`;
  try {
    const libRef = doc(db, 'libraries', libraryId);
    await updateDoc(libRef, {
      name,
      description,
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(libRef);
    if (!snap.exists()) {
      throw new Error('Knowledge library not found.');
    }
    return mapLibraryDoc(libraryId, snap.data() as Record<string, unknown>);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

async function commitDeleteRefs(refs: Array<ReturnType<typeof doc>>) {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function deleteLibrary(userId: string, libraryId: string): Promise<void> {
  const path = `libraries/${libraryId}`;
  try {
    // 1. Delete chunks first (Master Gate requires parent library to exist during child delete)
    const chunksSnap = await getDocs(
      query(collection(db, 'libraries', libraryId, 'chunks'), where('userId', '==', userId))
    );
    await commitDeleteRefs(chunksSnap.docs.map((d) => d.ref));

    // 2. For each document, delete pages, Storage file (if uploaded), then document records
    const docsSnap = await getDocs(
      query(collection(db, 'libraries', libraryId, 'documents'), where('userId', '==', userId))
    );

    for (const docSnap of docsSnap.docs) {
      const data = docSnap.data();
      const pagesSnap = await getDocs(
        query(
          collection(db, 'libraries', libraryId, 'documents', docSnap.id, 'pages'),
          where('userId', '==', userId)
        )
      );
      await commitDeleteRefs(pagesSnap.docs.map((p) => p.ref));

      if (typeof data.storagePath === 'string' && data.storagePath.length > 0) {
        try {
          await deleteObject(storageRef(storage, data.storagePath));
        } catch {
          // Ignore missing Storage object during cleanup
        }
      }
    }
    await commitDeleteRefs(docsSnap.docs.map((d) => d.ref));

    // 3. Delete folders
    const foldersSnap = await getDocs(
      query(collection(db, 'libraries', libraryId, 'folders'), where('userId', '==', userId))
    );
    await commitDeleteRefs(foldersSnap.docs.map((f) => f.ref));

    // 4. Delete the parent library document last
    await deleteDoc(doc(db, 'libraries', libraryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Library Detail, Folders & Documents Listeners ---

export async function getLibraryDetailOnce(
  userId: string,
  libraryId: string
): Promise<{
  library: KnowledgeLibrary;
  folders: Folder[];
  documents: DocumentRecord[];
}> {
  const libPath = `libraries/${libraryId}`;
  try {
    const libSnap = await getDoc(doc(db, 'libraries', libraryId));
    if (!libSnap.exists()) {
      throw new Error('Knowledge library not found.');
    }
    const library = mapLibraryDoc(libraryId, libSnap.data() as Record<string, unknown>);

    const [foldersSnap, docsSnap] = await Promise.all([
      getDocs(
        query(collection(db, 'libraries', libraryId, 'folders'), where('userId', '==', userId))
      ),
      getDocs(
        query(collection(db, 'libraries', libraryId, 'documents'), where('userId', '==', userId))
      ),
    ]);

    const rawDocs = docsSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Record<string, unknown>,
    }));

    const folders = foldersSnap.docs
      .map((f) => {
        const mapped = mapFolderDoc(f.id, f.data() as Record<string, unknown>);
        return {
          ...mapped,
          documentCount: rawDocs.filter((d) => d.data.folderId === f.id).length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const folderNameMap = new Map(folders.map((f) => [f.id, f.name]));
    const documents = rawDocs
      .map((d) =>
        mapDocumentDoc(
          d.id,
          d.data,
          library.name,
          d.data.folderId ? folderNameMap.get(d.data.folderId as string) || 'Unfiled' : 'Unfiled'
        )
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      library: {
        ...library,
        documentCount: documents.length,
        readyDocumentCount: documents.filter((d) => d.status === 'ready').length,
        processingDocumentCount: documents.filter(
          (d) => d.status === 'processing' || d.status === 'uploading'
        ).length,
        folderCount: folders.length,
      },
      folders,
      documents,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, libPath);
  }
}

export function subscribeLibraryDetail(
  userId: string,
  libraryId: string,
  callbacks: {
    onData: (detail: {
      library: KnowledgeLibrary;
      folders: Folder[];
      documents: DocumentRecord[];
    }) => void;
    onDeleted: () => void;
    onError: (err: Error) => void;
  }
): Unsubscribe {
  let latestLib: KnowledgeLibrary | null = null;
  let latestFolders: Folder[] = [];
  let latestRawDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
  let libLoaded = false;
  let foldersLoaded = false;
  let docsLoaded = false;

  const emit = () => {
    if (!libLoaded || !foldersLoaded || !docsLoaded || !latestLib) return;
    const folderNameMap = new Map(latestFolders.map((f) => [f.id, f.name]));
    const enrichedFolders = latestFolders
      .map((f) => ({
        ...f,
        documentCount: latestRawDocs.filter((d) => d.data.folderId === f.id).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const enrichedDocs = latestRawDocs
      .map((d) =>
        mapDocumentDoc(
          d.id,
          d.data,
          latestLib!.name,
          d.data.folderId ? folderNameMap.get(d.data.folderId as string) || 'Unfiled' : 'Unfiled'
        )
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    callbacks.onData({
      library: {
        ...latestLib,
        documentCount: enrichedDocs.length,
        readyDocumentCount: enrichedDocs.filter((d) => d.status === 'ready').length,
        processingDocumentCount: enrichedDocs.filter(
          (d) => d.status === 'processing' || d.status === 'uploading'
        ).length,
        folderCount: enrichedFolders.length,
      },
      folders: enrichedFolders,
      documents: enrichedDocs,
    });
  };

  const unsubLib = onSnapshot(
    doc(db, 'libraries', libraryId),
    (snap) => {
      if (!snap.exists()) {
        callbacks.onDeleted();
        return;
      }
      latestLib = mapLibraryDoc(snap.id, snap.data() as Record<string, unknown>);
      libLoaded = true;
      emit();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, `libraries/${libraryId}`);
      } catch (wrapped) {
        callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubFolders = onSnapshot(
    query(collection(db, 'libraries', libraryId, 'folders'), where('userId', '==', userId)),
    (snap) => {
      latestFolders = snap.docs.map((f) =>
        mapFolderDoc(f.id, f.data() as Record<string, unknown>)
      );
      foldersLoaded = true;
      emit();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `libraries/${libraryId}/folders`);
      } catch (wrapped) {
        callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubDocs = onSnapshot(
    query(collection(db, 'libraries', libraryId, 'documents'), where('userId', '==', userId)),
    (snap) => {
      latestRawDocs = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
      docsLoaded = true;
      emit();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `libraries/${libraryId}/documents`);
      } catch (wrapped) {
        callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  return () => {
    unsubLib();
    unsubFolders();
    unsubDocs();
  };
}

// --- Folder CRUD ---

export async function createFolder(
  userId: string,
  libraryId: string,
  name: string
): Promise<Folder> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) {
    throw new Error('Folder name must be between 1 and 80 characters.');
  }

  const folderId = makeId('fld');
  const path = `libraries/${libraryId}/folders/${folderId}`;

  try {
    const existingSnap = await getDocs(
      query(collection(db, 'libraries', libraryId, 'folders'), where('userId', '==', userId))
    );
    const duplicate = existingSnap.docs.find(
      (d) => String(d.data().name || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A folder named "${trimmed}" already exists in this library.`);
    }

    await setDoc(doc(db, 'libraries', libraryId, 'folders', folderId), {
      folderId,
      libraryId,
      userId,
      name: trimmed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'libraries', libraryId), {
      updatedAt: serverTimestamp(),
    });

    return {
      id: folderId,
      folderId,
      libraryId,
      userId,
      name: trimmed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documentCount: 0,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function renameFolder(
  userId: string,
  libraryId: string,
  folderId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) {
    throw new Error('Folder name must be between 1 and 80 characters.');
  }

  const path = `libraries/${libraryId}/folders/${folderId}`;
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'libraries', libraryId, 'folders'), where('userId', '==', userId))
    );
    const duplicate = existingSnap.docs.find(
      (d) =>
        d.id !== folderId &&
        String(d.data().name || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A folder named "${trimmed}" already exists in this library.`);
    }

    await updateDoc(doc(db, 'libraries', libraryId, 'folders', folderId), {
      name: trimmed,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'libraries', libraryId), {
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFolder(
  userId: string,
  libraryId: string,
  folderId: string
): Promise<void> {
  const path = `libraries/${libraryId}/folders/${folderId}`;
  try {
    const docsSnap = await getDocs(
      query(collection(db, 'libraries', libraryId, 'documents'), where('userId', '==', userId))
    );

    const affected = docsSnap.docs.filter((d) => d.data().folderId === folderId);
    if (affected.length > 0) {
      const batch = writeBatch(db);
      for (const docSnap of affected) {
        batch.update(docSnap.ref, {
          folderId: null,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    await deleteDoc(doc(db, 'libraries', libraryId, 'folders', folderId));
    await updateDoc(doc(db, 'libraries', libraryId), {
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Document CRUD + Firebase Storage + Text Extraction ---

function sanitizePagesForFirestore(pages: DocumentPage[]): DocumentPage[] {
  const result: DocumentPage[] = [];
  for (const page of pages) {
    const text = page.content || '';
    if (text.length <= 48000) {
      result.push({ pageNumber: result.length + 1, content: text });
    } else {
      for (let offset = 0; offset < text.length; offset += 48000) {
        result.push({
          pageNumber: result.length + 1,
          content: text.slice(offset, offset + 48000),
        });
      }
    }
  }
  return result.slice(0, 5000);
}

export interface UploadDocumentsResult {
  documents: DocumentRecord[];
  storageWarnings: string[];
}

async function tryUploadToFirebaseStorage(params: {
  userId: string;
  libraryId: string;
  documentId: string;
  safeName: string;
  file: File;
}): Promise<{
  uploaded: boolean;
  storagePath: string | null;
  downloadUrl: string | null;
  warning: string | null;
}> {
  const { userId, libraryId, documentId, safeName, file } = params;
  const bucketAvailable = await checkFirebaseStorageAvailable();
  if (!bucketAvailable) {
    return {
      uploaded: false,
      storagePath: null,
      downloadUrl: null,
      warning:
        'Firebase Storage is not enabled on this Firebase project yet; text was indexed in Firestore without storing the raw binary file.',
    };
  }

  const objectPath = `users/${userId}/libraries/${libraryId}/documents/${documentId}/${safeName}`;
  try {
    const fileRef = storageRef(storage, objectPath);
    await uploadBytes(fileRef, file, {
      contentType: file.type || 'application/octet-stream',
    });
    const downloadUrl = await getDownloadURL(fileRef);
    return {
      uploaded: true,
      storagePath: objectPath,
      downloadUrl,
      warning: null,
    };
  } catch (storageErr: unknown) {
    const storageMsg =
      storageErr instanceof Error ? storageErr.message : String(storageErr);
    return {
      uploaded: false,
      storagePath: null,
      downloadUrl: null,
      warning: `Raw file backup to Firebase Storage was skipped (${storageMsg}). Ensure Firebase Storage is enabled and storage.rules are deployed.`,
    };
  }
}

export async function uploadDocuments(
  userId: string,
  libraryId: string,
  files: File[],
  folderId: string | null
): Promise<UploadDocumentsResult> {
  if (files.length === 0) {
    throw new Error('Please select at least one file to upload.');
  }

  const libSnap = await getDoc(doc(db, 'libraries', libraryId));
  if (!libSnap.exists()) {
    throw new Error('Selected knowledge library not found.');
  }
  const libData = libSnap.data();
  const vectorStoreId = (libData.vectorStoreId as string) || `vs_biq_${libraryId}`;

  const createdRecords: DocumentRecord[] = [];
  const storageWarnings: string[] = [];

  for (const file of files) {
    const safeName = sanitizeFilename(file.name);
    const fileType = detectFileType(safeName);
    if (!fileType) {
      throw new Error(
        `Unsupported file format for "${safeName}". Supported formats: PDF, DOCX, TXT, MD.`
      );
    }
    if (file.size <= 0 || file.size > 25 * 1024 * 1024) {
      throw new Error(`"${safeName}" must be between 1 byte and 25 MB.`);
    }

    const documentId = makeId('doc');
    const docRef = doc(db, 'libraries', libraryId, 'documents', documentId);
    const docPath = `libraries/${libraryId}/documents/${documentId}`;

    // 1. Create initial metadata record in Firestore with status: 'processing'
    try {
      await setDoc(docRef, {
        documentId,
        libraryId,
        folderId: folderId || null,
        userId,
        filename: safeName,
        fileType,
        mimeType: (file.type || 'application/octet-stream').slice(0, 128),
        sizeBytes: Math.trunc(file.size),
        pageCount: 0,
        storagePath: null,
        downloadUrl: null,
        storageUploaded: false,
        providerFileId: `file_biq_${documentId}`,
        vectorStoreId,
        status: 'processing',
        errorMessage: null,
        chunkCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    }

    // 2. Run text extraction/embedding AND Firebase Storage backup in parallel (never hang 10m on Storage)
    const [extractSettled, storageResult] = await Promise.all([
      api
        .extractDocument({ file, documentId, libraryId })
        .then((res) => ({ ok: true as const, res }))
        .catch((err: unknown) => ({ ok: false as const, err })),
      tryUploadToFirebaseStorage({
        userId,
        libraryId,
        documentId,
        safeName,
        file,
      }),
    ]);

    if (!extractSettled.ok) {
      const errMsg =
        extractSettled.err instanceof Error
          ? extractSettled.err.message
          : 'Document extraction failed.';
      try {
        await updateDoc(docRef, {
          storagePath: storageResult.storagePath,
          downloadUrl: storageResult.downloadUrl,
          storageUploaded: storageResult.uploaded,
          status: 'failed',
          errorMessage: errMsg.slice(0, 500),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // ignore secondary status write error
      }
      throw new Error(errMsg);
    }

    if (storageResult.warning) {
      storageWarnings.push(storageResult.warning);
    }

    const extracted = extractSettled.res;

    // 3. Persist extracted pages, chunks, verified Storage flags, and ready status in Firestore
    try {
      const safePages = sanitizePagesForFirestore(extracted.pages);
      const safeChunks = extracted.chunks.slice(0, 10000);

      const writeOps: Array<{
        ref: ReturnType<typeof doc>;
        data: Record<string, unknown>;
      }> = [];

      for (const page of safePages) {
        const pageId = `pg_${documentId}_${page.pageNumber}`;
        writeOps.push({
          ref: doc(db, 'libraries', libraryId, 'documents', documentId, 'pages', pageId),
          data: {
            pageId,
            documentId,
            libraryId,
            userId,
            pageNumber: Math.trunc(page.pageNumber),
            content: page.content.slice(0, 50000),
          },
        });
      }

      for (const chunk of safeChunks) {
        const chunkId = chunk.id || `chk_${documentId}_${chunk.chunkIndex}`;
        writeOps.push({
          ref: doc(db, 'libraries', libraryId, 'chunks', chunkId),
          data: {
            chunkId,
            documentId,
            libraryId,
            userId,
            pageNumber: Math.trunc(chunk.pageNumber),
            sectionTitle: chunk.sectionTitle ? chunk.sectionTitle.slice(0, 200) : null,
            chunkIndex: Math.trunc(chunk.chunkIndex),
            content: chunk.content.slice(0, 10000),
            embedding: Array.isArray(chunk.embedding) ? chunk.embedding.slice(0, 4096) : [],
          },
        });
      }

      const BATCH_LIMIT = 350;
      const batchPromises: Array<Promise<void>> = [];
      for (let i = 0; i < writeOps.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const op of writeOps.slice(i, i + BATCH_LIMIT)) {
          batch.set(op.ref, op.data);
        }
        batchPromises.push(batch.commit());
      }
      await Promise.all(batchPromises);

      await Promise.all([
        updateDoc(docRef, {
          storagePath: storageResult.storagePath,
          downloadUrl: storageResult.downloadUrl,
          storageUploaded: storageResult.uploaded,
          pageCount: safePages.length,
          chunkCount: safeChunks.length,
          status: 'ready',
          errorMessage: null,
          updatedAt: serverTimestamp(),
        }),
        updateDoc(doc(db, 'libraries', libraryId), {
          updatedAt: serverTimestamp(),
        }),
      ]);

      const finalSnap = await getDoc(docRef);
      createdRecords.push(
        mapDocumentDoc(documentId, (finalSnap.data() || {}) as Record<string, unknown>)
      );
    } catch (firestoreErr: unknown) {
      handleFirestoreError(firestoreErr, OperationType.WRITE, docPath);
    }
  }

  return {
    documents: createdRecords,
    storageWarnings,
  };
}

export async function getDocumentDetail(
  userId: string,
  libraryId: string,
  documentId: string
): Promise<DocumentDetail> {
  const path = `libraries/${libraryId}/documents/${documentId}`;
  try {
    const [libSnap, docSnap, pagesSnap] = await Promise.all([
      getDoc(doc(db, 'libraries', libraryId)),
      getDoc(doc(db, 'libraries', libraryId, 'documents', documentId)),
      getDocs(
        query(
          collection(db, 'libraries', libraryId, 'documents', documentId, 'pages'),
          where('userId', '==', userId)
        )
      ),
    ]);

    if (!docSnap.exists()) {
      throw new Error('Document not found.');
    }

    const docData = docSnap.data() as Record<string, unknown>;
    const libraryName = libSnap.exists() ? String(libSnap.data().name || '') : '';
    let folderName = 'Unfiled';
    if (typeof docData.folderId === 'string' && docData.folderId) {
      const folderSnap = await getDoc(
        doc(db, 'libraries', libraryId, 'folders', docData.folderId)
      );
      if (folderSnap.exists()) {
        folderName = String(folderSnap.data().name || 'Unfiled');
      }
    }

    const pages: DocumentPage[] = pagesSnap.docs
      .map((p) => ({
        pageNumber: Number(p.data().pageNumber || 1),
        content: String(p.data().content || ''),
      }))
      .sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      ...mapDocumentDoc(documentId, docData, libraryName, folderName),
      pages,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function renameDocument(
  libraryId: string,
  documentId: string,
  newFilename: string
): Promise<void> {
  const cleaned = sanitizeFilename(newFilename);
  if (!cleaned || cleaned.length > 180) {
    throw new Error('Document filename must be between 1 and 180 characters.');
  }
  const path = `libraries/${libraryId}/documents/${documentId}`;
  try {
    await updateDoc(doc(db, 'libraries', libraryId, 'documents', documentId), {
      filename: cleaned,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'libraries', libraryId), {
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function moveDocument(
  libraryId: string,
  documentId: string,
  folderId: string | null
): Promise<void> {
  const path = `libraries/${libraryId}/documents/${documentId}`;
  try {
    await updateDoc(doc(db, 'libraries', libraryId, 'documents', documentId), {
      folderId: folderId || null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function reindexDocument(
  userId: string,
  libraryId: string,
  documentId: string
): Promise<void> {
  const docRef = doc(db, 'libraries', libraryId, 'documents', documentId);
  const path = `libraries/${libraryId}/documents/${documentId}`;

  const snap = await getDoc(docRef).catch((err) =>
    handleFirestoreError(err, OperationType.GET, path)
  );
  if (!snap.exists()) {
    throw new Error('Document not found.');
  }
  const data = snap.data();
  const downloadUrl = data.downloadUrl as string | null;
  if (!downloadUrl) {
    throw new Error('Original file is not available in Firebase Storage to re-index.');
  }

  try {
    await updateDoc(docRef, {
      status: 'processing',
      errorMessage: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  let extracted: { pages: DocumentPage[]; chunks: DocumentChunk[] };
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error('Unable to fetch original file from Firebase Storage.');
    }
    const blob = await response.blob();
    const file = new File([blob], String(data.filename || 'document.txt'), {
      type: String(data.mimeType || 'application/octet-stream'),
    });
    extracted = await api.extractDocument({ file, documentId, libraryId });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Re-indexing failed.';
    try {
      await updateDoc(docRef, {
        status: 'failed',
        errorMessage: errMsg.slice(0, 500),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // ignore secondary status write error
    }
    throw new Error(errMsg);
  }

  try {
    const [oldPages, oldChunks] = await Promise.all([
      getDocs(
        query(
          collection(db, 'libraries', libraryId, 'documents', documentId, 'pages'),
          where('userId', '==', userId)
        )
      ),
      getDocs(
        query(collection(db, 'libraries', libraryId, 'chunks'), where('userId', '==', userId))
      ),
    ]);
    await commitDeleteRefs(oldPages.docs.map((p) => p.ref));
    await commitDeleteRefs(
      oldChunks.docs.filter((c) => c.data().documentId === documentId).map((c) => c.ref)
    );

    const safePages = sanitizePagesForFirestore(extracted.pages);
    const safeChunks = extracted.chunks.slice(0, 10000);

    const writeOps: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];
    for (const page of safePages) {
      const pageId = `pg_${documentId}_${page.pageNumber}`;
      writeOps.push({
        ref: doc(db, 'libraries', libraryId, 'documents', documentId, 'pages', pageId),
        data: {
          pageId,
          documentId,
          libraryId,
          userId,
          pageNumber: Math.trunc(page.pageNumber),
          content: page.content.slice(0, 50000),
        },
      });
    }
    for (const chunk of safeChunks) {
      const chunkId = chunk.id || `chk_${documentId}_${chunk.chunkIndex}`;
      writeOps.push({
        ref: doc(db, 'libraries', libraryId, 'chunks', chunkId),
        data: {
          chunkId,
          documentId,
          libraryId,
          userId,
          pageNumber: Math.trunc(chunk.pageNumber),
          sectionTitle: chunk.sectionTitle ? chunk.sectionTitle.slice(0, 200) : null,
          chunkIndex: Math.trunc(chunk.chunkIndex),
          content: chunk.content.slice(0, 10000),
          embedding: Array.isArray(chunk.embedding) ? chunk.embedding.slice(0, 4096) : [],
        },
      });
    }

    const BATCH_LIMIT = 350;
    for (let i = 0; i < writeOps.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const op of writeOps.slice(i, i + BATCH_LIMIT)) {
        batch.set(op.ref, op.data);
      }
      await batch.commit();
    }

    await updateDoc(docRef, {
      pageCount: safePages.length,
      chunkCount: safeChunks.length,
      status: 'ready',
      errorMessage: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteDocument(
  userId: string,
  libraryId: string,
  documentId: string
): Promise<void> {
  const path = `libraries/${libraryId}/documents/${documentId}`;
  try {
    const docRef = doc(db, 'libraries', libraryId, 'documents', documentId);
    const snap = await getDoc(docRef);
    const storagePath = snap.exists() ? (snap.data().storagePath as string | null) : null;

    const [pagesSnap, chunksSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'libraries', libraryId, 'documents', documentId, 'pages'),
          where('userId', '==', userId)
        )
      ),
      getDocs(
        query(collection(db, 'libraries', libraryId, 'chunks'), where('userId', '==', userId))
      ),
    ]);

    await commitDeleteRefs(pagesSnap.docs.map((p) => p.ref));
    await commitDeleteRefs(
      chunksSnap.docs.filter((c) => c.data().documentId === documentId).map((c) => c.ref)
    );

    if (storagePath) {
      try {
        await deleteObject(storageRef(storage, storagePath));
      } catch {
        // Ignore if file already removed in Storage
      }
    }

    await deleteDoc(docRef);
    await updateDoc(doc(db, 'libraries', libraryId), {
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Library-Isolated Hybrid Retrieval & RAG Ask ---

function tokenize(text: string): string[] {
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'for', 'to', 'of',
    'in', 'with', 'as', 'by', 'be', 'are', 'was', 'were', 'it', 'that', 'this',
    'from', 'what', 'how', 'when', 'where', 'who', 'why', 'do', 'does', 'can',
    'our', 'your', 'my', 'their', 'we', 'you', 'they', 'about', 'into', 'new',
    'mean', 'means', 'meaning', 'define', 'definition', 'explain', 'tell', 'describe',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
}

function computeLexicalScore(queryText: string, docText: string, filename: string): number {
  const qTokens = tokenize(queryText);
  if (qTokens.length === 0) return 0;

  const haystack = `${filename} ${docText}`.toLowerCase();
  const docTokens = new Set(tokenize(haystack));

  let matched = 0;
  let weighted = 0;
  for (const token of qTokens) {
    if (docTokens.has(token)) {
      matched += 1;
      weighted += 1;
    } else if (token.length >= 4 && haystack.includes(token)) {
      matched += 0.65;
      weighted += 0.65;
    }
  }

  let bigramBonus = 0;
  for (let i = 0; i < qTokens.length - 1; i++) {
    const pair = `${qTokens[i]} ${qTokens[i + 1]}`;
    if (haystack.includes(pair)) {
      bigramBonus += 0.15;
    }
  }

  return Math.min(1, weighted / qTokens.length + bigramBonus) * (matched > 0 ? 1 : 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function askLibrariesQuestion(params: {
  userId: string;
  libraries: KnowledgeLibrary[];
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<AskResponse> {
  const { userId, libraries, question, history } = params;
  if (libraries.length === 0) {
    throw new Error('Select at least one knowledge library to ask a question.');
  }

  const primaryLibrary = libraries[0];
  const libraryScope = libraries.map((lib) => ({
    libraryId: lib.id,
    libraryName: lib.name,
    vectorStoreId: lib.vectorStoreId,
  }));
  const scopeDisplayName = libraries.map((l) => l.name).join(', ');

  try {
    const perLibraryData = await Promise.all(
      libraries.map(async (library) => {
        const [docsSnap, foldersSnap, chunksSnap] = await Promise.all([
          getDocs(
            query(collection(db, 'libraries', library.id, 'documents'), where('userId', '==', userId))
          ),
          getDocs(
            query(collection(db, 'libraries', library.id, 'folders'), where('userId', '==', userId))
          ),
          getDocs(
            query(collection(db, 'libraries', library.id, 'chunks'), where('userId', '==', userId))
          ),
        ]);

        const docs = docsSnap.docs.map((d) =>
          mapDocumentDoc(d.id, d.data() as Record<string, unknown>)
        );
        const readyDocs = docs.filter((d) => d.status === 'ready');
        const processingDocs = docs.filter(
          (d) => d.status === 'processing' || d.status === 'uploading'
        );
        const docsById = new Map(readyDocs.map((d) => [d.id, d]));
        const foldersById = new Map(
          foldersSnap.docs.map((f) => [f.id, String(f.data().name || '')])
        );

        const readyChunks: DocumentChunk[] = chunksSnap.docs
          .map((c) => {
            const d = c.data();
            return {
              id: String(d.chunkId || c.id),
              chunkId: String(d.chunkId || c.id),
              documentId: String(d.documentId || ''),
              libraryId: String(d.libraryId || library.id),
              userId: String(d.userId || userId),
              pageNumber: Number(d.pageNumber || 1),
              sectionTitle: (d.sectionTitle as string | null) ?? null,
              chunkIndex: Number(d.chunkIndex || 0),
              content: String(d.content || ''),
              embedding: Array.isArray(d.embedding) ? (d.embedding as number[]) : [],
            };
          })
          .filter((c) => docsById.has(c.documentId));

        return {
          library,
          readyDocs,
          processingDocs,
          docsById,
          foldersById,
          readyChunks,
        };
      })
    );

    const totalReadyDocs = perLibraryData.reduce((sum, entry) => sum + entry.readyDocs.length, 0);
    const totalProcessingDocs = perLibraryData.reduce(
      (sum, entry) => sum + entry.processingDocs.length,
      0
    );
    const totalReadyChunks = perLibraryData.reduce(
      (sum, entry) => sum + entry.readyChunks.length,
      0
    );

    if (totalReadyDocs === 0 || totalReadyChunks === 0) {
      return await api.answerFromCandidates({
        libraryId: primaryLibrary.id,
        libraryName: scopeDisplayName,
        vectorStoreId: primaryLibrary.vectorStoreId,
        libraries: libraryScope,
        readyDocumentsSearched: totalReadyDocs,
        processingDocumentsSkipped: totalProcessingDocs,
        question,
        history,
        candidates: [],
      });
    }

    const { embeddings } = await api.embedTexts([question]).catch(() => ({ embeddings: [null] }));
    const queryVector = embeddings[0] || null;

    const ranked = perLibraryData.flatMap(
      ({ library, docsById, foldersById, readyChunks }) =>
        readyChunks.map((chunk) => {
          const docMeta = docsById.get(chunk.documentId)!;
          const folderName = docMeta.folderId ? foldersById.get(docMeta.folderId) || null : null;
          const lexicalScore = computeLexicalScore(question, chunk.content, docMeta.filename);
          const vectorScore =
            queryVector &&
            chunk.embedding &&
            chunk.embedding.length === queryVector.length &&
            queryVector.length > 0
              ? Math.max(0, cosineSimilarity(queryVector, chunk.embedding))
              : 0;
          const score =
            queryVector && chunk.embedding && chunk.embedding.length > 0
              ? vectorScore * 0.65 + lexicalScore * 0.35
              : lexicalScore;

          return {
            chunk: {
              id: chunk.id,
              documentId: chunk.documentId,
              libraryId: library.id,
              pageNumber: chunk.pageNumber,
              sectionTitle: chunk.sectionTitle,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
            },
            documentTitle: docMeta.filename,
            fileType: docMeta.fileType,
            libraryId: library.id,
            libraryName: library.name,
            folderName,
            score,
            lexicalScore,
            vectorScore,
          };
        })
    );

    ranked.sort((a, b) => b.score - a.score);

    const candidateWindow = libraries.length > 1 ? 10 : 6;
    const topCandidates = ranked
      .slice(0, candidateWindow)
      .filter((item) => {
        if (queryVector && item.vectorScore > 0) {
          return (
            item.lexicalScore >= 0.25 ||
            (item.vectorScore >= 0.62 && item.lexicalScore > 0) ||
            item.vectorScore >= 0.72
          );
        }
        return item.lexicalScore >= 0.2;
      })
      .map(({ chunk, documentTitle, fileType, libraryId, libraryName, folderName, score }) => ({
        chunk,
        documentTitle,
        fileType,
        libraryId,
        libraryName,
        folderName,
        score,
      }));

    return await api.answerFromCandidates({
      libraryId: primaryLibrary.id,
      libraryName: scopeDisplayName,
      vectorStoreId: primaryLibrary.vectorStoreId,
      libraries: libraryScope,
      readyDocumentsSearched: totalReadyDocs,
      processingDocumentsSkipped: totalProcessingDocs,
      question,
      history,
      candidates: topCandidates,
    });
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(
      err,
      OperationType.LIST,
      libraries.map((l) => `libraries/${l.id}`).join(',')
    );
  }
}

export async function askLibraryQuestion(params: {
  userId: string;
  library: KnowledgeLibrary;
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<AskResponse> {
  return askLibrariesQuestion({
    userId: params.userId,
    libraries: [params.library],
    question: params.question,
    history: params.history,
  });
}
