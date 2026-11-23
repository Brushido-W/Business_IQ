import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
// Prevent Firebase Storage SDK from retrying for 2-10 minutes when a bucket is unprovisioned or blocked
storage.maxUploadRetryTime = 8000;
storage.maxOperationRetryTime = 8000;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_STORAGE_BUCKET = firebaseConfig.storageBucket;

let cachedStorageCheck: { available: boolean; checkedAt: number } | null = null;

export async function checkFirebaseStorageAvailable(): Promise<boolean> {
  if (!FIREBASE_STORAGE_BUCKET) return false;
  const now = Date.now();
  if (cachedStorageCheck) {
    const ttl = cachedStorageCheck.available ? 5 * 60 * 1000 : 30 * 1000;
    if (now - cachedStorageCheck.checkedAt < ttl) {
      return cachedStorageCheck.available;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(FIREBASE_STORAGE_BUCKET)}/o?maxResults=1`,
      { method: 'GET', signal: controller.signal }
    );
    // 404 means Firebase Storage has not been enabled/provisioned for this project yet.
    const available = res.status !== 404;
    cachedStorageCheck = { available, checkedAt: Date.now() };
    return available;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractFriendlyErrorMessage(error: unknown, fallback = 'Operation failed.'): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as Partial<FirestoreErrorInfo>;
    if (parsed && typeof parsed.error === 'string') {
      if (/Missing or insufficient permissions/i.test(parsed.error)) {
        return 'Permission denied by Firestore security rules. Please verify you are signed in with a verified account.';
      }
      if (/Quota exceeded/i.test(parsed.error)) {
        return 'Firestore daily free-tier quota exceeded. Quota resets tomorrow or upgrade in Firebase Console.';
      }
      return parsed.error;
    }
  } catch {
    // Not a JSON-wrapped FirestoreErrorInfo
  }
  return error.message || fallback;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
