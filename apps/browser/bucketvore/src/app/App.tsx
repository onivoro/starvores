import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  createBucketvoreApi,
  BucketInfo,
  S3ObjectInfo,
  FilePreviewResponse,
} from '@onivoro/axios-bucketvore';

const api = createBucketvoreApi('');

// -- Utilities --

const FILE_ICONS: Record<string, string> = {
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', webp: '🖼️', svg: '🖼️',
  txt: '📄', md: '📄', json: '📄', xml: '📄', csv: '📄', log: '📄', yaml: '📄', yml: '📄',
  ts: '📄', js: '📄', jsx: '📄', tsx: '📄', html: '📄', css: '📄', scss: '📄',
  py: '📄', java: '📄', c: '📄', cpp: '📄', h: '📄', go: '📄', rs: '📄', sh: '📄', bash: '📄',
  mp4: '🎥', webm: '🎥', ogg: '🎥', mov: '🎥',
  mp3: '🎵', wav: '🎵', flac: '🎵',
  pdf: '📕',
  zip: '📦', tar: '📦', gz: '📦', rar: '📦', '7z': '📦',
  doc: '📝', docx: '📝',
  xls: '📊', xlsx: '📊',
  ppt: '📽️', pptx: '📽️',
};

function getFileIcon(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || '📎';
}

function getFileName(key: string): string {
  return key.split('/').pop() || key;
}

function getFolderName(prefix: string): string {
  const parts = prefix.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || prefix;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(2)} ${units[i]}`;
}

const MONACO_LANGUAGES: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', html: 'html', css: 'css', scss: 'scss', xml: 'xml',
  md: 'markdown', yaml: 'yaml', yml: 'yaml',
  py: 'python', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
  go: 'go', rs: 'rust', sh: 'shell', bash: 'shell',
  sql: 'sql', graphql: 'graphql', dockerfile: 'dockerfile',
  rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
  r: 'r', lua: 'lua', perl: 'perl', pl: 'perl',
  toml: 'ini', ini: 'ini', conf: 'ini', cfg: 'ini',
  csv: 'plaintext', log: 'plaintext', txt: 'plaintext',
  env: 'plaintext', gitignore: 'plaintext',
};

function getMonacoLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return MONACO_LANGUAGES[ext] || 'plaintext';
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

interface UploadProgressItem {
  name: string;
  status: 'uploading' | 'done' | 'error';
}

// -- App --

export function App() {
  const [buckets, setBuckets] = useState<BucketInfo[]>([]);
  const [selectedBucket, setSelectedBucket] = useState('');
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [files, setFiles] = useState<S3ObjectInfo[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [bucketFilter, setBucketFilter] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressItem[]>([]);
  const [preview, setPreview] = useState<FilePreviewResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Deep linking --
  const readUrlState = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      bucket: params.get('bucket') || '',
      prefix: params.get('prefix') || '',
    };
  }, []);

  const updateUrl = useCallback((bucket: string, prefix: string) => {
    const params = new URLSearchParams();
    if (bucket) {
      params.set('bucket', bucket);
      if (prefix) params.set('prefix', prefix);
    }
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  }, []);

  // -- Load buckets on mount --
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.listBuckets();
        setBuckets(data);
      } catch {
        setError('Failed to load buckets');
      } finally {
        setLoadingBuckets(false);
      }
    })();
  }, []);

  // -- Restore state from URL on mount --
  useEffect(() => {
    const { bucket, prefix } = readUrlState();
    if (bucket) {
      setSelectedBucket(bucket);
      setCurrentPrefix(prefix);
    }
  }, [readUrlState]);

  // -- Browser back/forward --
  useEffect(() => {
    const handler = () => {
      const { bucket, prefix } = readUrlState();
      setSelectedBucket(bucket);
      setCurrentPrefix(prefix);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [readUrlState]);

  // -- Load files when bucket/prefix changes --
  useEffect(() => {
    if (!selectedBucket) {
      setFiles([]);
      setFolders([]);
      return;
    }
    (async () => {
      setLoadingFiles(true);
      setError(null);
      try {
        const { data } = await api.listFiles(selectedBucket, currentPrefix);
        setFiles(data.objects);
        setFolders(data.folders);
      } catch {
        setError('Failed to load files');
      } finally {
        setLoadingFiles(false);
      }
    })();
  }, [selectedBucket, currentPrefix]);

  // -- Actions --
  const selectBucket = useCallback((name: string) => {
    setSelectedBucket(name);
    setCurrentPrefix('');
    setFileFilter('');
    updateUrl(name, '');
  }, [updateUrl]);

  const navigateToFolder = useCallback((prefix: string) => {
    setCurrentPrefix(prefix);
    setFileFilter('');
    updateUrl(selectedBucket, prefix);
  }, [selectedBucket, updateUrl]);

  const navigateToBreadcrumb = useCallback((prefix: string) => {
    setCurrentPrefix(prefix);
    setFileFilter('');
    updateUrl(selectedBucket, prefix);
  }, [selectedBucket, updateUrl]);

  const handlePreview = useCallback(async (key: string) => {
    try {
      const { data } = await api.previewFile(selectedBucket, key);
      setPreview(data);
    } catch {
      alert('Error loading preview');
    }
  }, [selectedBucket]);

  const handleDownload = useCallback(async (key: string) => {
    try {
      const { data } = await api.downloadFile(selectedBucket, key);
      window.open(data.url, '_blank');
    } catch {
      alert('Error generating download link');
    }
  }, [selectedBucket]);

  const handleDelete = useCallback(async (key: string) => {
    if (!confirm(`Delete ${getFileName(key)}?`)) return;
    try {
      await api.deleteFile(selectedBucket, key);
      setFiles(prev => prev.filter(f => f.key !== key));
    } catch {
      alert('Error deleting file');
    }
  }, [selectedBucket]);

  const handleDeleteFolder = useCallback(async (prefix: string) => {
    if (!confirm(`Delete folder "${getFolderName(prefix)}" and all its contents?`)) return;
    try {
      await api.deleteFolder(selectedBucket, prefix);
      setFolders(prev => prev.filter(f => f !== prefix));
    } catch {
      alert('Error deleting folder');
    }
  }, [selectedBucket]);

  const handleCopyPath = useCallback(async (key: string) => {
    const path = `s3://${selectedBucket}/${key}`;
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      // fallback
    }
  }, [selectedBucket]);

  const handleUpload = useCallback(async (fileList: File[]) => {
    if (fileList.length === 0) return;
    const progress: UploadProgressItem[] = fileList.map(f => ({ name: f.name, status: 'uploading' }));
    setUploadProgress([...progress]);

    for (let i = 0; i < fileList.length; i++) {
      try {
        await api.uploadFile(selectedBucket, currentPrefix, fileList[i]);
        progress[i].status = 'done';
      } catch {
        progress[i].status = 'error';
      }
      setUploadProgress([...progress]);
    }

    setTimeout(async () => {
      setUploadProgress([]);
      setShowUpload(false);
      // Reload files
      try {
        const { data } = await api.listFiles(selectedBucket, currentPrefix);
        setFiles(data.objects);
        setFolders(data.folders);
      } catch { /* ignore */ }
    }, 1500);
  }, [selectedBucket, currentPrefix]);

  const handleRefresh = useCallback(async () => {
    if (!selectedBucket) return;
    setLoadingFiles(true);
    try {
      const { data } = await api.listFiles(selectedBucket, currentPrefix);
      setFiles(data.objects);
      setFolders(data.folders);
    } catch {
      setError('Failed to refresh files');
    } finally {
      setLoadingFiles(false);
    }
  }, [selectedBucket, currentPrefix]);

  // -- Computed --
  const filteredBuckets = useMemo(() => {
    if (!bucketFilter.trim()) return buckets;
    const q = bucketFilter.toLowerCase();
    return buckets.filter(b => b.name.toLowerCase().includes(q));
  }, [buckets, bucketFilter]);

  const filteredFiles = useMemo(() => {
    if (!fileFilter.trim()) return files;
    const q = fileFilter.toLowerCase();
    return files.filter(f => getFileName(f.key).toLowerCase().includes(q));
  }, [files, fileFilter]);

  const filteredFolders = useMemo(() => {
    if (!fileFilter.trim()) return folders;
    const q = fileFilter.toLowerCase();
    return folders.filter(f => getFolderName(f).toLowerCase().includes(q));
  }, [folders, fileFilter]);

  const breadcrumbs = useMemo(() => {
    if (!currentPrefix) return [];
    const parts = currentPrefix.replace(/\/$/, '').split('/');
    return parts.map((part, i) => ({
      label: part,
      prefix: parts.slice(0, i + 1).join('/') + '/',
    }));
  }, [currentPrefix]);

  // -- Render --
  return (
    <div className="bv-shell">
      {/* Sidebar */}
      <aside className="bv-sidebar">
        <div className="bv-sidebar-header">
          <div className="bv-sidebar-title">BucketVore</div>
          <div className="bv-sidebar-subtitle">S3 File Explorer</div>
        </div>
        <div className="bv-sidebar-search">
          <input
            className="bv-input"
            placeholder="Filter buckets..."
            value={bucketFilter}
            onChange={e => setBucketFilter(e.target.value)}
          />
        </div>
        <div className="bv-bucket-list">
          {loadingBuckets ? (
            <div className="bv-loading">
              <div className="bv-spinner" />
              <span>Loading buckets...</span>
            </div>
          ) : filteredBuckets.length === 0 ? (
            <div className="bv-empty">
              <div className="bv-empty-icon">🪣</div>
              <span>{bucketFilter ? 'No buckets match filter' : 'No buckets found'}</span>
            </div>
          ) : (
            filteredBuckets.map(b => (
              <button
                key={b.name}
                className={`bv-bucket-item${selectedBucket === b.name ? ' is-active' : ''}`}
                onClick={() => selectBucket(b.name)}
              >
                <span className="bv-bucket-icon">🪣</span>
                <span className="bv-bucket-name">{b.name}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="bv-main">
        {/* Toolbar */}
        <div className="bv-toolbar">
          <div className="bv-toolbar-left">
            <div className="bv-breadcrumbs">
              {selectedBucket && (
                <>
                  <button className="bv-breadcrumb" onClick={() => navigateToBreadcrumb('')}>
                    {selectedBucket}
                  </button>
                  {breadcrumbs.map(bc => (
                    <span key={bc.prefix} className="flex items-center gap-1">
                      <span className="bv-breadcrumb-sep">/</span>
                      <button className="bv-breadcrumb" onClick={() => navigateToBreadcrumb(bc.prefix)}>
                        {bc.label}
                      </button>
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className="bv-toolbar-actions">
            {selectedBucket && (
              <>
                <input
                  className="bv-input"
                  style={{ width: 180 }}
                  placeholder="Filter files..."
                  value={fileFilter}
                  onChange={e => setFileFilter(e.target.value)}
                />
                <button className="bv-btn" onClick={() => setShowUpload(true)}>Upload</button>
                <button className="bv-btn-ghost" onClick={handleRefresh}>Refresh</button>
              </>
            )}
          </div>
        </div>

        {/* File Explorer */}
        <div className="bv-file-explorer">
          {error && (
            <div className="bv-error">
              <span>⚠️</span>
              <span>{error}</span>
              <button className="bv-btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )}

          {!selectedBucket ? (
            <div className="bv-empty">
              <div className="bv-empty-icon">🪣</div>
              <p>Select a bucket to browse files</p>
            </div>
          ) : loadingFiles ? (
            <div className="bv-loading">
              <div className="bv-spinner" />
              <span>Loading files...</span>
            </div>
          ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
            <div className="bv-empty">
              <div className="bv-empty-icon">📂</div>
              <p>{fileFilter ? 'No files match filter' : 'This folder is empty'}</p>
            </div>
          ) : (
            <div className="bv-file-list">
              {/* Folders */}
              {filteredFolders.map(folder => (
                <div
                  key={folder}
                  className="bv-file-item is-folder"
                  onClick={() => navigateToFolder(folder)}
                >
                  <span className="bv-file-icon">📁</span>
                  <div className="bv-file-info">
                    <div className="bv-file-name">{getFolderName(folder)}</div>
                  </div>
                  <div className="bv-file-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="bv-btn-icon"
                      title="Delete folder"
                      onClick={() => handleDeleteFolder(folder)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {/* Files */}
              {filteredFiles.map(file => (
                <div key={file.key} className="bv-file-item">
                  <span className="bv-file-icon">{getFileIcon(file.key)}</span>
                  <div className="bv-file-info">
                    <div className="bv-file-name">{getFileName(file.key)}</div>
                    <div className="bv-file-meta">
                      {formatFileSize(file.size)}
                      {file.lastModified && ` · ${formatDate(file.lastModified)}`}
                    </div>
                  </div>
                  <div className="bv-file-actions">
                    <button className="bv-btn-icon" title="Preview" onClick={() => handlePreview(file.key)}>
                      👁️
                    </button>
                    <button className="bv-btn-icon" title="Copy S3 path" onClick={() => handleCopyPath(file.key)}>
                      📋
                    </button>
                    <button className="bv-btn-icon" title="Download" onClick={() => handleDownload(file.key)}>
                      ⬇️
                    </button>
                    <button className="bv-btn-icon" title="Delete" onClick={() => handleDelete(file.key)}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Upload Modal */}
      {showUpload && (
        <div className="bv-modal-backdrop" onClick={() => { if (uploadProgress.length === 0) setShowUpload(false); }}>
          <div className="bv-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="bv-modal-header">
              <span className="bv-modal-title">Upload Files</span>
              <button className="bv-btn-icon" onClick={() => { if (uploadProgress.length === 0) setShowUpload(false); }}>
                ✕
              </button>
            </div>
            <div className="bv-modal-body">
              <div
                className={`bv-upload-zone${dragOver ? ' is-dragover' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer?.files) handleUpload(Array.from(e.dataTransfer.files));
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="bv-upload-icon">📤</div>
                <p style={{ color: 'var(--color-text)' }}>Drop files here or click to browse</p>
                <p style={{ fontSize: 12, color: 'var(--color-subtle)', marginTop: 4 }}>
                  Uploading to: {selectedBucket}/{currentPrefix || '(root)'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files) handleUpload(Array.from(e.target.files));
                  }}
                />
              </div>

              {uploadProgress.length > 0 && (
                <div className="bv-upload-progress">
                  {uploadProgress.map((item, i) => (
                    <div key={i} className="bv-upload-item">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </span>
                      <span style={{
                        color: item.status === 'done' ? 'var(--color-success)' :
                               item.status === 'error' ? 'var(--color-danger)' :
                               'var(--color-subtle)',
                        flexShrink: 0,
                      }}>
                        {item.status === 'uploading' ? 'Uploading...' : item.status === 'done' ? '✓ Done' : '✗ Failed'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="bv-modal-backdrop" onClick={() => setPreview(null)}>
          <div className="bv-modal" style={{ maxWidth: 900, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="bv-modal-header">
              <span className="bv-modal-title">{preview.fileName}</span>
              <div className="flex items-center gap-2">
                <button className="bv-btn-ghost" onClick={() => handleDownload(preview.key)}>
                  Download
                </button>
                <button className="bv-btn-icon" onClick={() => setPreview(null)}>✕</button>
              </div>
            </div>
            <div className="bv-preview-meta">
              {preview.metadata.contentType && <span>Type: {preview.metadata.contentType}</span>}
              {preview.metadata.contentLength != null && (
                <span> · Size: {formatFileSize(preview.metadata.contentLength)}</span>
              )}
              {preview.metadata.lastModified && (
                <span> · Modified: {formatDate(preview.metadata.lastModified)}</span>
              )}
            </div>
            <div className="bv-preview-content">
              {preview.previewType === 'image' && preview.presignedUrl && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <img
                    src={preview.presignedUrl}
                    alt={preview.fileName}
                    style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
                  />
                </div>
              )}
              {preview.previewType === 'text' && preview.content != null && (
                <Editor
                  height="60vh"
                  language={getMonacoLanguage(preview.fileName)}
                  value={preview.content}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                  }}
                />
              )}
              {preview.previewType === 'video' && preview.presignedUrl && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <video
                    src={preview.presignedUrl}
                    controls
                    style={{ maxWidth: '100%', maxHeight: '60vh' }}
                  />
                </div>
              )}
              {preview.previewType === 'audio' && preview.presignedUrl && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                  <audio src={preview.presignedUrl} controls />
                </div>
              )}
              {preview.previewType === 'pdf' && preview.presignedUrl && (
                <iframe
                  src={preview.presignedUrl}
                  style={{ width: '100%', height: '60vh', border: 'none' }}
                  title={preview.fileName}
                />
              )}
              {preview.previewType === 'none' && (
                <div className="bv-empty">
                  <div className="bv-empty-icon">{getFileIcon(preview.key)}</div>
                  <p>Preview not available for this file type</p>
                  <button className="bv-btn" onClick={() => handleDownload(preview.key)}>
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
