/**
 * S3 Explorer Alpine.js Component
 * Client-side TypeScript with full IDE support
 */

import { copyS3PathToClipboard } from './utils/clipboard.client';
import type { S3ClientState, UploadProgress } from '../shared/types.shared';

declare global {
  interface Window {
    Alpine: any;
  }
}

export function s3Explorer(): S3ClientState & Record<string, any> {
  return {
    // State
    selectedBucket: '',
    currentPrefix: '',
    buckets: [],
    files: [],
    folders: [],
    viewMode: 'list',
    bucketsHtml: '<div class="loading"><div class="spinner"></div><p>Loading buckets...</p></div>',
    filesHtml: '',
    breadcrumbsHtml: '',
    bucketFilter: '',
    fileFilter: '',
    showUpload: false,
    showPreview: false,
    uploadProgress: [] as UploadProgress[],
    uploadProgressHtml: '',
    previewHtml: '',
    activeTab: 'data',

    // Computed properties
    get filteredBucketsHtml(): string {
      if (!this.bucketFilter.trim()) {
        return this.bucketsHtml;
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(this.bucketsHtml, 'text/html');
      const bucketItems = doc.querySelectorAll('.bucket-item');

      bucketItems.forEach((item) => {
        const bucketName = item.querySelector('.bucket-name')?.textContent?.toLowerCase() || '';
        if (bucketName.includes(this.bucketFilter.toLowerCase())) {
          (item as HTMLElement).style.display = '';
        } else {
          (item as HTMLElement).style.display = 'none';
        }
      });

      const visibleCount = doc.querySelectorAll('.bucket-item:not([style*="display: none"])').length;
      if (visibleCount === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No buckets match your filter</p></div>';
      }

      return doc.body.innerHTML;
    },

    get filteredFilesHtml(): string {
      if (!this.fileFilter.trim() || !this.filesHtml) {
        return this.filesHtml;
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(this.filesHtml, 'text/html');
      const fileItems = doc.querySelectorAll('.file-item');

      fileItems.forEach((item) => {
        const fileName = item.querySelector('.file-name')?.textContent?.toLowerCase() || '';
        if (fileName.includes(this.fileFilter.toLowerCase())) {
          (item as HTMLElement).style.display = '';
        } else {
          (item as HTMLElement).style.display = 'none';
        }
      });

      const visibleCount = doc.querySelectorAll('.file-item:not([style*="display: none"])').length;
      if (visibleCount === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No files match your filter</p></div>';
      }

      return doc.body.innerHTML;
    },

    // Initialization
    async init(): Promise<void> {
      await this.loadBuckets();
      this.restoreStateFromUrl();
      this.setupUrlSync();
    },

    // Deep linking: restore state from URL
    restoreStateFromUrl(): void {
      const params = new URLSearchParams(window.location.search);
      const bucket = params.get('bucket');
      const prefix = params.get('prefix') || '';

      if (bucket) {
        this.selectedBucket = bucket;
        this.currentPrefix = prefix;
        this.loadFiles();
      }
    },

    // Deep linking: update URL when state changes
    updateUrl(): void {
      const params = new URLSearchParams();

      if (this.selectedBucket) {
        params.set('bucket', this.selectedBucket);

        if (this.currentPrefix) {
          params.set('prefix', this.currentPrefix);
        }
      }

      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

      window.history.pushState({}, '', newUrl);
    },

    // Setup browser back/forward button support
    setupUrlSync(): void {
      window.addEventListener('popstate', () => {
        this.restoreStateFromUrl();
      });
    },

    // API Methods
    async loadBuckets(): Promise<void> {
      try {
        const response = await fetch('/api/buckets');
        this.bucketsHtml = await response.text();
      } catch (error) {
        this.bucketsHtml = '<div class="error"><div class="error-icon">⚠️</div><p>Error loading buckets</p></div>';
      }
    },

    async selectBucket(bucketName: string): Promise<void> {
      this.selectedBucket = bucketName;
      this.currentPrefix = '';
      this.fileFilter = '';
      this.updateUrl();
      await this.loadFiles();
    },

    async loadFiles(): Promise<void> {
      try {
        const params = new URLSearchParams({
          bucket: this.selectedBucket,
          prefix: this.currentPrefix
        });

        const response = await fetch(`/api/files?${params}`);
        const data = await response.json();

        this.filesHtml = data.filesHtml || '';
        this.breadcrumbsHtml = data.breadcrumbsHtml || '';
      } catch (error) {
        this.filesHtml = '<div class="error"><div class="error-icon">⚠️</div><p>Error loading files</p></div>';
      }
    },

    async navigateToFolder(prefix: string): Promise<void> {
      this.currentPrefix = prefix;
      this.fileFilter = '';
      this.updateUrl();
      await this.loadFiles();
    },

    async previewFile(key: string): Promise<void> {
      try {
        const params = new URLSearchParams({
          bucket: this.selectedBucket,
          key: key
        });

        const response = await fetch(`/api/files/preview?${params}`);
        this.previewHtml = await response.text();
        this.showPreview = true;
      } catch (error) {
        alert('Error loading preview');
      }
    },

    closePreview(): void {
      this.showPreview = false;
      this.previewHtml = '';
    },

    async downloadFile(key: string): Promise<void> {
      try {
        const params = new URLSearchParams({
          bucket: this.selectedBucket,
          key: key
        });

        const response = await fetch(`/api/files/download?${params}`);
        const data = await response.json();
        window.open(data.url, '_blank');
      } catch (error) {
        alert('Error generating download link');
      }
    },

    async deleteFile(key: string): Promise<void> {
      if (!confirm(`Delete ${key}?`)) return;

      try {
        await fetch(`/api/files/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket: this.selectedBucket, key })
        });
        await this.loadFiles();
      } catch (error) {
        alert('Error deleting file');
      }
    },

    async copyS3Path(key: string): Promise<void> {
      const element = (event as any)?.target as HTMLElement | undefined;
      await copyS3PathToClipboard(this.selectedBucket, key, element);
    },

    async deleteFolder(prefix: string): Promise<void> {
      if (!confirm(`Delete folder ${prefix} and all its contents?`)) return;

      try {
        await fetch(`/api/files/delete-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket: this.selectedBucket, prefix })
        });
        await this.loadFiles();
      } catch (error) {
        alert('Error deleting folder');
      }
    },

    // Upload functionality
    handleFileSelect(event: Event): void {
      const input = event.target as HTMLInputElement;
      if (input.files) {
        const files = Array.from(input.files);
        this.uploadFiles(files);
      }
    },

    handleDrop(event: DragEvent): void {
      (event.target as HTMLElement).classList.remove('drag-over');
      if (event.dataTransfer?.files) {
        const files = Array.from(event.dataTransfer.files);
        this.uploadFiles(files);
      }
    },

    async uploadFiles(files: File[]): Promise<void> {
      this.uploadProgress = files.map(f => ({ name: f.name, status: 'Uploading...' }));

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bucket', this.selectedBucket);
        formData.append('prefix', this.currentPrefix);

        try {
          await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          this.uploadProgress[i].status = '✓ Complete';
        } catch (error) {
          this.uploadProgress[i].status = '✗ Failed';
        }
      }

      setTimeout(async () => {
        this.uploadProgress = [];
        this.showUpload = false;
        await this.loadFiles();
      }, 2000);
    },

    async refresh(): Promise<void> {
      await this.loadFiles();
    },

    filterBuckets(): void {
      // Reactive computed property handles this
    },

    filterFiles(): void {
      // Reactive computed property handles this
    }
  };
}

// Auto-register with Alpine when it initializes
if (typeof window !== 'undefined') {
  // Register immediately if Alpine is already available
  if ((window as any).Alpine) {
    (window as any).Alpine.data('s3Explorer', s3Explorer);
  } else {
    // Otherwise wait for Alpine to initialize
    document.addEventListener('alpine:init', () => {
      (window as any).Alpine.data('s3Explorer', s3Explorer);
    });
  }
}
