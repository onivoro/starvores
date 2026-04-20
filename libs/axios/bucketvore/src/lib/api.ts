import axios, { AxiosInstance } from 'axios';

export type PreviewType = 'image' | 'text' | 'video' | 'audio' | 'pdf' | 'none';

export interface BucketInfo {
  name: string;
  creationDate?: string;
}

export interface S3ObjectInfo {
  key: string;
  size?: number;
  lastModified?: string;
}

export interface ListFilesResponse {
  objects: S3ObjectInfo[];
  folders: string[];
  prefix: string;
}

export interface FileMetadata {
  contentLength?: number;
  contentType?: string;
  lastModified?: string;
}

export interface FilePreviewResponse {
  key: string;
  fileName: string;
  previewType: PreviewType;
  content?: string;
  presignedUrl?: string;
  metadata: FileMetadata;
}

export interface UploadResponse {
  success: boolean;
  key: string;
  size: number;
}

export interface DeleteResponse {
  success: boolean;
}

export interface BucketRegionResponse {
  region: string;
}

export interface DownloadResponse {
  url: string;
}

export class BucketvoreApi {
  constructor(private readonly http: AxiosInstance) {}

  listBuckets() {
    return this.http.get<BucketInfo[]>('/api/buckets');
  }

  getBucketRegion(bucket: string) {
    return this.http.get<BucketRegionResponse>(`/api/buckets/${encodeURIComponent(bucket)}/region`);
  }

  listFiles(bucket: string, prefix?: string) {
    return this.http.get<ListFilesResponse>('/api/files', { params: { bucket, prefix } });
  }

  previewFile(bucket: string, key: string) {
    return this.http.get<FilePreviewResponse>('/api/files/preview', { params: { bucket, key } });
  }

  downloadFile(bucket: string, key: string) {
    return this.http.get<DownloadResponse>('/api/files/download', { params: { bucket, key } });
  }

  deleteFile(bucket: string, key: string) {
    return this.http.post<DeleteResponse>('/api/files/delete', { bucket, key });
  }

  deleteFolder(bucket: string, prefix: string) {
    return this.http.post<DeleteResponse>('/api/files/delete-folder', { bucket, prefix });
  }

  uploadFile(bucket: string, prefix: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', bucket);
    formData.append('prefix', prefix);
    return this.http.post<UploadResponse>('/api/upload', formData);
  }
}

export const createBucketvoreApi = (baseURL = '') => {
  const http = axios.create({ baseURL });
  return new BucketvoreApi(http);
};
