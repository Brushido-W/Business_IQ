import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Menu, X } from 'lucide-react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  ChatMessage,
  Citation,
  DocumentDetail,
  DocumentRecord,
  Folder,
  KnowledgeLibrary,
  SystemStatus,
} from './types/knowledge.ts';
import { api } from './lib/api.ts';
import { auth, extractFriendlyErrorMessage } from './lib/firebase.ts';
import {
  askLibrariesQuestion,
  createFolder,
  createLibrary,
  deleteDocument,
  deleteFolder,
  deleteLibrary,
  ensureUserProfile,
  getDocumentDetail,
  getLibraryDetailOnce,
  listLibrariesOnce,
  moveDocument,
  reindexDocument,
  renameDocument,
  renameFolder,
  subscribeLibraries,
  subscribeLibraryDetail,
  updateLibrary,
  updateUserDisplayName,
  uploadDocuments,
} from './lib/firestoreStore.ts';
import { formatChatTime } from './lib/format.ts';
import { BusinessIQLogo } from './components/BrandIcons.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { NavSection, Sidebar } from './components/Sidebar.tsx';
import { AskAIScreen } from './components/AskAIScreen.tsx';
import { LibrariesScreen } from './components/LibrariesScreen.tsx';
import { LibraryDetailScreen } from './components/LibraryDetailScreen.tsx';
import { DocumentViewerScreen } from './components/DocumentViewerScreen.tsx';
import { SettingsScreen } from './components/SettingsScreen.tsx';
import {
  ConfirmModal,
  DocumentRenameModal,
  FolderModal,
  LibraryModal,
  UploadDocumentsModal,
} from './components/Modals.tsx';

type ViewMode =
  | { type: 'ask' }
  | { type: 'libraries' }
  | { type: 'library-detail'; libraryId: string }
  | {
      type: 'document-viewer';
      libraryId: string;
      documentId: string;
      citation: Citation | null;
      fromAsk: boolean;
    }
  | { type: 'settings' };

interface ToastNotice {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [view, setView] = useState<ViewMode>({ type: 'ask' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [operatorName, setOperatorName] = useState('Operator');

  // Data state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [libraries, setLibraries] = useState<KnowledgeLibrary[]>([]);
  const [loadingLibraries, setLoadingLibraries] = useState(true);
  const [selectedAskLibraryIds, setSelectedAskLibraryIds] = useState<string[]>([]);
  const hasAutoSelectedAskRef = useRef(false);

  // Library Detail state
  const [activeLibraryDetail, setActiveLibraryDetail] = useState<KnowledgeLibrary | null>(null);
  const [activeFolders, setActiveFolders] = useState<Folder[]>([]);
  const [activeDocuments, setActiveDocuments] = useState<DocumentRecord[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Document Viewer state
  const [activeDocumentDetail, setActiveDocumentDetail] = useState<DocumentDetail | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);

  // Ask BIQ state (scoped cleanly per library combination)
  const [messagesByScope, setMessagesByScope] = useState<Record<string, ChatMessage[]>>({});
  const [isAsking, setIsAsking] = useState(false);

  // Upload Modal state
  const [uploadModalState, setUploadModalState] = useState<{
    open: boolean;
    libraryId: string;
    libraryName: string;
    folders: Folder[];
    defaultFolderId: string | null;
  }>({
    open: false,
    libraryId: '',
    libraryName: '',
    folders: [],
    defaultFolderId: null,
  });

  // Modals state
  const [libraryModal, setLibraryModal] = useState<{
    open: boolean;
    mode: 'create' | 'rename';
    target: KnowledgeLibrary | null;
  }>({ open: false, mode: 'create', target: null });

  const [folderModal, setFolderModal] = useState<{
    open: boolean;
    mode: 'create' | 'rename';
    target: Folder | null;
  }>({ open: false, mode: 'create', target: null });

  const [documentRenameModal, setDocumentRenameModal] = useState<{
    open: boolean;
    target: { id: string; libraryId: string; filename: string } | null;
  }>({ open: false, target: null });

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => Promise<void>;
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: async () => {},
  });

  const [toast, setToast] = useState<ToastNotice | null>(null);

  const showToast = useCallback((kind: 'success' | 'error', message: string) => {
    const id = Date.now();
    setToast({ id, kind, message });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4500);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (!firebaseUser) {
        setLibraries([]);
        setSelectedAskLibraryIds([]);
        hasAutoSelectedAskRef.current = false;
        setActiveLibraryDetail(null);
        setActiveFolders([]);
        setActiveDocuments([]);
        setActiveDocumentDetail(null);
        setMessagesByScope({});
        setLoadingLibraries(false);
        setView({ type: 'ask' });
      }
    });
    return () => unsubscribe();
  }, []);

  // System status check
  useEffect(() => {
    void api
      .getSystemStatus()
      .then(setSystemStatus)
      .catch(() => {
        // Non-blocking
      });
  }, []);

  // Ensure user profile & subscribe to libraries once authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    setLoadingLibraries(true);
    void ensureUserProfile({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    })
      .then((profile) => {
        setOperatorName(profile.displayName);
      })
      .catch((err: unknown) => {
        showToast('error', extractFriendlyErrorMessage(err, 'Unable to load user profile.'));
      });

    const unsub = subscribeLibraries(
      user.uid,
      (libs) => {
        setLibraries(libs);
        setSelectedAskLibraryIds((prev) => {
          const valid = prev.filter((id) => libs.some((l) => l.id === id));
          if (valid.length > 0) return valid;
          if (!hasAutoSelectedAskRef.current && libs[0]?.id) {
            hasAutoSelectedAskRef.current = true;
            return [libs[0].id];
          }
          return valid;
        });
        setLoadingLibraries(false);
      },
      (err) => {
        setLoadingLibraries(false);
        showToast('error', extractFriendlyErrorMessage(err, 'Unable to load knowledge libraries.'));
      }
    );

    return () => unsub();
  }, [authReady, user, showToast]);

  const refreshLibraries = useCallback(async () => {
    if (!user) return;
    try {
      const libs = await listLibrariesOnce(user.uid);
      setLibraries(libs);
      setSelectedAskLibraryIds((prev) => {
        const valid = prev.filter((id) => libs.some((l) => l.id === id));
        if (valid.length > 0) return valid;
        if (!hasAutoSelectedAskRef.current && libs[0]?.id) {
          hasAutoSelectedAskRef.current = true;
          return [libs[0].id];
        }
        return valid;
      });
    } catch (err: unknown) {
      showToast(
        'error',
        extractFriendlyErrorMessage(err, 'Unable to load knowledge libraries.')
      );
    }
  }, [user, showToast]);

  // Subscribe to library detail when inside library-detail view
  useEffect(() => {
    if (!authReady || !user || view.type !== 'library-detail') {
      return;
    }

    setSelectedFolderId(null);
    setLoadingDetail(true);

    const unsub = subscribeLibraryDetail(user.uid, view.libraryId, {
      onData: (detail) => {
        setActiveLibraryDetail(detail.library);
        setActiveFolders(detail.folders);
        setActiveDocuments(detail.documents);
        setLoadingDetail(false);
      },
      onDeleted: () => {
        setActiveLibraryDetail(null);
        setLoadingDetail(false);
        setView({ type: 'libraries' });
      },
      onError: (err) => {
        setLoadingDetail(false);
        showToast('error', extractFriendlyErrorMessage(err, 'Unable to load library details.'));
        setView({ type: 'libraries' });
      },
    });

    return () => unsub();
  }, [authReady, user, view, showToast]);

  // Load document detail when inside document-viewer view
  const loadDocumentDetail = useCallback(
    async (libraryId: string, documentId: string) => {
      if (!user) return;
      setLoadingDocument(true);
      try {
        const docDetail = await getDocumentDetail(user.uid, libraryId, documentId);
        setActiveDocumentDetail(docDetail);
      } catch (err: unknown) {
        showToast('error', extractFriendlyErrorMessage(err, 'Unable to open document.'));
        setView({ type: 'library-detail', libraryId });
      } finally {
        setLoadingDocument(false);
      }
    },
    [user, showToast]
  );

  useEffect(() => {
    if (!authReady || !user || view.type !== 'document-viewer') return;
    void loadDocumentDetail(view.libraryId, view.documentId);
  }, [authReady, user, view, loadDocumentDetail]);

  const activeNavSection: NavSection =
    view.type === 'ask'
      ? 'ask'
      : view.type === 'settings'
      ? 'settings'
      : 'libraries';

  const handleSelectNav = (section: NavSection) => {
    if (section === 'ask') {
      setView({ type: 'ask' });
    } else if (section === 'libraries') {
      setView({ type: 'libraries' });
      void refreshLibraries();
    } else {
      setView({ type: 'settings' });
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast('success', 'Signed out successfully.');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Unable to sign out.');
    }
  };

  // --- Ask BIQ Handlers ---
  const askScopeKey =
    selectedAskLibraryIds.length > 0 ? [...selectedAskLibraryIds].sort().join(',') : '';

  const handleSendQuestion = async (question: string) => {
    if (!user || selectedAskLibraryIds.length === 0) return;
    const selectedLibs = libraries.filter((l) => selectedAskLibraryIds.includes(l.id));
    if (selectedLibs.length === 0) return;

    const scopeKey = [...selectedLibs.map((l) => l.id)].sort().join(',');
    const primaryLib = selectedLibs[0];
    const scopeNames = selectedLibs.map((l) => l.name);
    const scopeDisplayName = scopeNames.join(', ');

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: formatChatTime(),
      libraryId: primaryLib.id,
      libraryName: scopeDisplayName,
      libraryIds: selectedLibs.map((l) => l.id),
      libraryNames: scopeNames,
    };

    const existingMessages = messagesByScope[scopeKey] || [];
    setMessagesByScope((prev) => ({
      ...prev,
      [scopeKey]: [...existingMessages, userMsg],
    }));

    setIsAsking(true);
    try {
      const history = existingMessages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await askLibrariesQuestion({
        userId: user.uid,
        libraries: selectedLibs,
        question,
        history,
      });

      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        timestamp: formatChatTime(),
        libraryId: res.libraryId,
        libraryName: res.libraryName,
        libraryIds: res.libraryIds || selectedLibs.map((l) => l.id),
        libraryNames: res.libraryNames || scopeNames,
        citations: res.citations,
        insufficientEvidence: res.insufficientEvidence,
        processingWarning: res.processingWarning,
      };

      setMessagesByScope((prev) => ({
        ...prev,
        [scopeKey]: [...(prev[scopeKey] || []), assistantMsg],
      }));
    } catch (err: unknown) {
      const errorText = extractFriendlyErrorMessage(
        err,
        'Error while querying the selected knowledge libraries.'
      );
      const errMsg: ChatMessage = {
        id: `msg_e_${Date.now()}`,
        role: 'assistant',
        content: errorText,
        timestamp: formatChatTime(),
        libraryId: primaryLib.id,
        libraryName: scopeDisplayName,
        libraryIds: selectedLibs.map((l) => l.id),
        libraryNames: scopeNames,
        isError: true,
      };
      setMessagesByScope((prev) => ({
        ...prev,
        [scopeKey]: [...(prev[scopeKey] || []), errMsg],
      }));
    } finally {
      setIsAsking(false);
    }
  };

  const handleClearChat = () => {
    if (!askScopeKey) return;
    setMessagesByScope((prev) => ({
      ...prev,
      [askScopeKey]: [],
    }));
  };

  const handleOpenQuickUploadFromAsk = async () => {
    if (!user || selectedAskLibraryIds.length === 0) return;
    const targetLibraryId = selectedAskLibraryIds[0];
    try {
      const detail = await getLibraryDetailOnce(user.uid, targetLibraryId);
      setUploadModalState({
        open: true,
        libraryId: detail.library.id,
        libraryName: detail.library.name,
        folders: detail.folders,
        defaultFolderId: null,
      });
    } catch (err: unknown) {
      showToast('error', extractFriendlyErrorMessage(err, 'Unable to open upload dialog.'));
    }
  };

  // --- CRUD Handlers ---
  const handleSaveLibrary = async (name: string, description: string) => {
    if (!user) throw new Error('You must be signed in to manage libraries.');
    try {
      if (libraryModal.mode === 'create') {
        const created = await createLibrary(user.uid, { name, description });
        await refreshLibraries();
        hasAutoSelectedAskRef.current = true;
        setSelectedAskLibraryIds([created.id]);
        showToast('success', `Created library "${created.name}".`);
      } else if (libraryModal.target) {
        const updated = await updateLibrary(libraryModal.target.id, { name, description });
        await refreshLibraries();
        if (view.type === 'library-detail' && view.libraryId === libraryModal.target.id) {
          setActiveLibraryDetail((prev) => (prev ? { ...prev, ...updated } : updated));
        }
        showToast('success', `Updated library "${updated.name}".`);
      }
    } catch (err: unknown) {
      throw new Error(extractFriendlyErrorMessage(err, 'Failed to save knowledge library.'));
    }
  };

  const requestDeleteLibrary = (library: KnowledgeLibrary) => {
    if (!user) return;
    setConfirmModal({
      open: true,
      title: `Delete "${library.name}"?`,
      description:
        'This will permanently remove the knowledge library, its folders, uploaded documents, and indexed passages from Firebase. This action cannot be undone.',
      confirmLabel: 'Delete Library',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteLibrary(user.uid, library.id);
          setSelectedAskLibraryIds((prev) => prev.filter((id) => id !== library.id));
          setMessagesByScope((prev) => {
            const copy = { ...prev };
            for (const key of Object.keys(copy)) {
              if (key.split(',').includes(library.id)) {
                delete copy[key];
              }
            }
            return copy;
          });
          await refreshLibraries();
          if (view.type === 'library-detail' && view.libraryId === library.id) {
            setView({ type: 'libraries' });
          }
          showToast('success', `Deleted library "${library.name}".`);
        } catch (err: unknown) {
          const msg = extractFriendlyErrorMessage(err, 'Unable to delete library.');
          showToast('error', msg);
          throw new Error(msg);
        }
      },
    });
  };

  const handleSaveFolder = async (name: string) => {
    if (!user || !activeLibraryDetail) throw new Error('No active library selected.');
    try {
      if (folderModal.mode === 'create') {
        await createFolder(user.uid, activeLibraryDetail.id, name);
        await refreshLibraries();
        showToast('success', `Created folder "${name}".`);
      } else if (folderModal.mode === 'rename' && folderModal.target) {
        await renameFolder(user.uid, activeLibraryDetail.id, folderModal.target.id, name);
        showToast('success', `Renamed folder to "${name}".`);
      }
    } catch (err: unknown) {
      throw new Error(extractFriendlyErrorMessage(err, 'Failed to save folder.'));
    }
  };

  const requestDeleteFolder = (folder: Folder) => {
    if (!user || !activeLibraryDetail) return;
    setConfirmModal({
      open: true,
      title: `Delete folder "${folder.name}"?`,
      description:
        'The folder will be removed. Any documents inside it will remain in the library as Unfiled.',
      confirmLabel: 'Delete Folder',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteFolder(user.uid, activeLibraryDetail.id, folder.id);
          if (selectedFolderId === folder.id) {
            setSelectedFolderId(null);
          }
          await refreshLibraries();
          showToast('success', `Deleted folder "${folder.name}".`);
        } catch (err: unknown) {
          const msg = extractFriendlyErrorMessage(err, 'Unable to delete folder.');
          showToast('error', msg);
          throw new Error(msg);
        }
      },
    });
  };

  const handleUploadDocuments = async (files: File[], folderId: string | null) => {
    if (!user) throw new Error('You must be signed in to upload documents.');
    const targetLibId = uploadModalState.libraryId;
    if (!targetLibId) return;
    try {
      const result = await uploadDocuments(user.uid, targetLibId, files, folderId);
      await refreshLibraries();
      if (result.storageWarnings.length > 0) {
        showToast(
          'success',
          `Indexed ${files.length} file${files.length === 1 ? '' : 's'} for Ask BIQ. Raw file backup skipped (enable Firebase Storage to store original binaries).`
        );
      } else {
        showToast(
          'success',
          `Uploaded and indexed ${files.length} file${files.length === 1 ? '' : 's'}.`
        );
      }
    } catch (err: unknown) {
      await refreshLibraries();
      throw new Error(extractFriendlyErrorMessage(err, 'Upload failed. Please try again.'));
    }
  };

  const handleRenameDocumentSubmit = async (newFilename: string) => {
    if (!documentRenameModal.target) return;
    const { id, libraryId } = documentRenameModal.target;
    try {
      await renameDocument(libraryId, id, newFilename);
      if (view.type === 'document-viewer' && view.documentId === id) {
        await loadDocumentDetail(libraryId, id);
      }
      showToast('success', `Renamed document to "${newFilename}".`);
    } catch (err: unknown) {
      throw new Error(extractFriendlyErrorMessage(err, 'Failed to rename document.'));
    }
  };

  const requestDeleteDocument = (docItem: {
    id: string;
    filename: string;
    libraryId: string;
  }) => {
    if (!user) return;
    setConfirmModal({
      open: true,
      title: `Delete "${docItem.filename}"?`,
      description:
        'This document, its stored file, and its indexed passages will be permanently deleted from this library.',
      confirmLabel: 'Delete Document',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDocument(user.uid, docItem.libraryId, docItem.id);
          await refreshLibraries();
          if (view.type === 'document-viewer') {
            setView({ type: 'library-detail', libraryId: docItem.libraryId });
          }
          showToast('success', `Deleted "${docItem.filename}".`);
        } catch (err: unknown) {
          const msg = extractFriendlyErrorMessage(err, 'Unable to delete document.');
          showToast('error', msg);
          throw new Error(msg);
        }
      },
    });
  };

  const handleMoveDocument = async (docId: string, folderId: string | null) => {
    if (!activeLibraryDetail) return;
    try {
      await moveDocument(activeLibraryDetail.id, docId, folderId);
      showToast('success', 'Moved document to folder.');
    } catch (err: unknown) {
      showToast('error', extractFriendlyErrorMessage(err, 'Unable to move document.'));
    }
  };

  const handleReindexDocument = async (docId: string) => {
    if (!user || !activeLibraryDetail) return;
    try {
      await reindexDocument(user.uid, activeLibraryDetail.id, docId);
      await refreshLibraries();
      showToast('success', 'Document re-indexed successfully.');
    } catch (err: unknown) {
      showToast('error', extractFriendlyErrorMessage(err, 'Unable to re-index document.'));
    }
  };

  const handleUpdateOperatorName = async (name: string) => {
    if (!user) return;
    try {
      await updateUserDisplayName(user.uid, name);
      setOperatorName(name.trim());
      showToast('success', 'Profile updated.');
    } catch (err: unknown) {
      showToast('error', extractFriendlyErrorMessage(err, 'Unable to update profile.'));
    }
  };

  // Auth loading state
  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-[#64748B] gap-3">
        <BusinessIQLogo className="w-9 h-9" />
        <div className="flex items-center gap-2 text-[14px]">
          <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
          <span>Connecting to Business IQ...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated gate
  if (!user) {
    return <AuthGate />;
  }

  const currentAskMessages = askScopeKey
    ? messagesByScope[askScopeKey] || []
    : [];

  return (
    <div className="min-h-screen h-screen flex flex-col md:flex-row bg-white text-[#0F172A] overflow-hidden">
      {/* Compact Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-[#0F1829] text-white shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-[8px] text-[#CBD5E1] hover:text-white hover:bg-white/10"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BusinessIQLogo className="w-6 h-6" />
          <span className="text-[16px] font-bold tracking-[-0.02em]">Business IQ</span>
        </div>
        <span className="text-[11.5px] text-[#94A3B8]">KnowledgeBase AI</span>
      </header>

      {/* Dark Navy Sidebar Shell */}
      <Sidebar
        activeSection={activeNavSection}
        onSelectSection={handleSelectNav}
        operatorName={operatorName}
        userEmail={user.email}
        onSignOut={() => void handleSignOut()}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 h-[calc(100vh-3.5rem)] md:h-screen overflow-hidden relative bg-white">
        {view.type === 'ask' && (
          <AskAIScreen
            libraries={libraries}
            selectedLibraryIds={selectedAskLibraryIds}
            onChangeSelectedLibraries={(ids) => {
              hasAutoSelectedAskRef.current = true;
              setSelectedAskLibraryIds(ids);
            }}
            messages={currentAskMessages}
            isAsking={isAsking}
            onSendQuestion={handleSendQuestion}
            onClearChat={handleClearChat}
            onOpenCitation={(citation) =>
              setView({
                type: 'document-viewer',
                libraryId: citation.libraryId,
                documentId: citation.documentId,
                citation,
                fromAsk: true,
              })
            }
            onOpenQuickUpload={() => void handleOpenQuickUploadFromAsk()}
            onNavigateToLibraries={() => setView({ type: 'libraries' })}
            geminiConfigured={systemStatus ? systemStatus.geminiConfigured : true}
          />
        )}

        {view.type === 'libraries' && (
          <LibrariesScreen
            libraries={libraries}
            loading={loadingLibraries}
            onOpenLibrary={(libraryId) =>
              setView({ type: 'library-detail', libraryId })
            }
            onCreateClick={() =>
              setLibraryModal({ open: true, mode: 'create', target: null })
            }
            onRenameClick={(library) =>
              setLibraryModal({ open: true, mode: 'rename', target: library })
            }
            onDeleteClick={requestDeleteLibrary}
          />
        )}

        {view.type === 'library-detail' &&
          (loadingDetail && !activeLibraryDetail ? (
            <div className="h-full flex items-center justify-center text-[#64748B] gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
              <span className="text-[14px]">Loading library...</span>
            </div>
          ) : activeLibraryDetail ? (
            <LibraryDetailScreen
              library={activeLibraryDetail}
              folders={activeFolders}
              documents={activeDocuments}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              onBack={() => {
                setView({ type: 'libraries' });
                void refreshLibraries();
              }}
              onRenameLibrary={() =>
                setLibraryModal({
                  open: true,
                  mode: 'rename',
                  target: activeLibraryDetail,
                })
              }
              onDeleteLibrary={() => requestDeleteLibrary(activeLibraryDetail)}
              onAskAboutLibrary={() => {
                hasAutoSelectedAskRef.current = true;
                setSelectedAskLibraryIds([activeLibraryDetail.id]);
                setView({ type: 'ask' });
              }}
              onCreateFolder={() =>
                setFolderModal({ open: true, mode: 'create', target: null })
              }
              onRenameFolder={(folder) =>
                setFolderModal({ open: true, mode: 'rename', target: folder })
              }
              onDeleteFolder={requestDeleteFolder}
              onUploadClick={() =>
                setUploadModalState({
                  open: true,
                  libraryId: activeLibraryDetail.id,
                  libraryName: activeLibraryDetail.name,
                  folders: activeFolders,
                  defaultFolderId: selectedFolderId,
                })
              }
              onOpenDocument={(documentId) =>
                setView({
                  type: 'document-viewer',
                  libraryId: activeLibraryDetail.id,
                  documentId,
                  citation: null,
                  fromAsk: false,
                })
              }
              onRenameDocument={(docItem) =>
                setDocumentRenameModal({
                  open: true,
                  target: {
                    id: docItem.id,
                    libraryId: docItem.libraryId,
                    filename: docItem.filename,
                  },
                })
              }
              onDeleteDocument={requestDeleteDocument}
              onMoveDocument={handleMoveDocument}
              onReindexDocument={handleReindexDocument}
            />
          ) : null)}

        {view.type === 'document-viewer' &&
          (loadingDocument || !activeDocumentDetail ? (
            <div className="h-full flex items-center justify-center text-[#64748B] gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
              <span className="text-[14px]">Loading document...</span>
            </div>
          ) : (
            <DocumentViewerScreen
              document={activeDocumentDetail}
              activeCitation={view.citation}
              openedFromAsk={view.fromAsk}
              onBackToLibrary={() =>
                setView({
                  type: 'library-detail',
                  libraryId: activeDocumentDetail.libraryId,
                })
              }
              onBackToAsk={() => setView({ type: 'ask' })}
              onRenameDocument={() =>
                setDocumentRenameModal({
                  open: true,
                  target: {
                    id: activeDocumentDetail.id,
                    libraryId: activeDocumentDetail.libraryId,
                    filename: activeDocumentDetail.filename,
                  },
                })
              }
              onDeleteDocument={() =>
                requestDeleteDocument({
                  id: activeDocumentDetail.id,
                  filename: activeDocumentDetail.filename,
                  libraryId: activeDocumentDetail.libraryId,
                })
              }
            />
          ))}

        {view.type === 'settings' && (
          <SettingsScreen
            operatorName={operatorName}
            userEmail={user.email}
            onUpdateOperatorName={handleUpdateOperatorName}
            onSignOut={() => void handleSignOut()}
            systemStatus={systemStatus}
          />
        )}

        {/* Crisp Toast Notification */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 max-w-[380px] flex items-center gap-2.5 px-4 py-3 rounded-[10px] border shadow-[0_8px_24px_rgba(15,23,42,0.12)] bg-white border-[#E2E8F0]">
            {toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
            )}
            <span className="text-[13px] font-medium text-[#0F172A]">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-0.5 text-[#94A3B8] hover:text-[#475569] ml-1"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      <LibraryModal
        open={libraryModal.open}
        mode={libraryModal.mode}
        initialName={libraryModal.target?.name || ''}
        initialDescription={libraryModal.target?.description || ''}
        onClose={() => setLibraryModal({ open: false, mode: 'create', target: null })}
        onSubmit={handleSaveLibrary}
      />

      <FolderModal
        open={folderModal.open}
        mode={folderModal.mode}
        initialName={folderModal.target?.name || ''}
        onClose={() => setFolderModal({ open: false, mode: 'create', target: null })}
        onSubmit={handleSaveFolder}
      />

      <DocumentRenameModal
        open={documentRenameModal.open}
        initialName={documentRenameModal.target?.filename || ''}
        onClose={() => setDocumentRenameModal({ open: false, target: null })}
        onSubmit={handleRenameDocumentSubmit}
      />

      <UploadDocumentsModal
        open={uploadModalState.open}
        libraryName={uploadModalState.libraryName}
        folders={uploadModalState.folders}
        defaultFolderId={uploadModalState.defaultFolderId}
        onClose={() =>
          setUploadModalState((prev) => ({ ...prev, open: false }))
        }
        onUpload={handleUploadDocuments}
      />

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel={confirmModal.confirmLabel}
        danger={confirmModal.danger}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
}
