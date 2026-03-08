/**
 * Shared types between client and server
 * These can be imported by both .client.ts and .server.ts files
 */

export interface BucketInfo {
  name: string;
  creationDate?: Date;
}

export interface FileInfo {
  Key: string;
  Size?: number;
  LastModified?: Date;
  isFolder?: boolean;
}

export interface UploadProgress {
  name: string;
  status: string;
}

export interface S3ClientState {
  selectedBucket: string;
  currentPrefix: string;
  buckets: BucketInfo[];
  files: FileInfo[];
  folders: string[];
  bucketsHtml: string;
  filesHtml: string;
  breadcrumbsHtml: string;
  bucketFilter: string;
  fileFilter: string;
  showUpload: boolean;
  showPreview: boolean;
  uploadProgress: UploadProgress[];
  uploadProgressHtml: string;
  previewHtml: string;
  activeTab: string;
}
