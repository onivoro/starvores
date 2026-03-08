import { Injectable } from '@nestjs/common';
import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, GetBucketLocationCommand, _Object } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppServerBucketvoreConfig } from '../app-server-bucketvore-config.class';
import { fromIni } from '@aws-sdk/credential-providers';

export interface S3Object extends _Object {
  Key: string;
  Size?: number;
  LastModified?: Date;
  isFolder?: boolean;
}

export interface BucketInfo {
  name: string;
  creationDate?: Date;
}

@Injectable()
export class S3Service {
  private bucketRegionCache: Map<string, string> = new Map();
  private regionalClients: Map<string, S3Client> = new Map();

  constructor(
    private readonly s3Client: S3Client,
    private readonly config: AppServerBucketvoreConfig
  ) {}

  /**
   * Get or create an S3 client for a specific region
   */
  private async getClientForBucket(bucket: string): Promise<S3Client> {
    // Try to get cached region
    let region = this.bucketRegionCache.get(bucket);

    if (!region) {
      // Fetch bucket region
      try {
        const command = new GetBucketLocationCommand({ Bucket: bucket });
        const response = await this.s3Client.send(command);
        // LocationConstraint is null for us-east-1
        region = response.LocationConstraint || 'us-east-1';
        this.bucketRegionCache.set(bucket, region);
      } catch (error) {
        console.warn(`Could not get region for bucket ${bucket}, using us-east-1 as fallback`, error);
        region = 'us-east-1';
      }
    }

    // Return existing client if we have one for this region
    if (this.regionalClients.has(region)) {
      return this.regionalClients.get(region)!;
    }

    // Create new regional client
    const clientConfig: any = {
      region,
    };

    if (this.config.AWS_PROFILE) {
      clientConfig.credentials = fromIni({ profile: this.config.AWS_PROFILE });
    }

    const regionalClient = new S3Client(clientConfig);
    this.regionalClients.set(region, regionalClient);

    return regionalClient;
  }

  async listBuckets(): Promise<BucketInfo[]> {
    const command = new ListBucketsCommand({});
    const response = await this.s3Client.send(command);

    return (response.Buckets || []).map(bucket => ({
      name: bucket.Name!,
      creationDate: bucket.CreationDate
    }));
  }

  async listObjects(bucket: string, prefix?: string): Promise<{ objects: S3Object[], commonPrefixes: string[] }> {
    const client = await this.getClientForBucket(bucket);
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || '',
      Delimiter: '/'
    });

    const response = await client.send(command);

    const objects: S3Object[] = (response.Contents || [])
      .filter(obj => obj.Key !== prefix) // Filter out the folder itself
      .map(obj => ({
        ...obj,
        Key: obj.Key!,
        isFolder: false
      }));

    const commonPrefixes = (response.CommonPrefixes || [])
      .map(cp => cp.Prefix!)
      .filter(p => p !== prefix);

    return { objects, commonPrefixes };
  }

  async getObject(bucket: string, key: string): Promise<{ body: any, contentType?: string, contentLength?: number }> {
    const client = await this.getClientForBucket(bucket);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await client.send(command);
    const body = await response.Body?.transformToByteArray();

    return {
      body,
      contentType: response.ContentType,
      contentLength: response.ContentLength
    };
  }

  async getObjectMetadata(bucket: string, key: string): Promise<any> {
    const client = await this.getClientForBucket(bucket);
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });

    return await client.send(command);
  }

  async getPresignedDownloadUrl(bucket: string, key: string, expiresIn: number = 3600): Promise<string> {
    const client = await this.getClientForBucket(bucket);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${key.split('/').pop()}"`
    });

    return await getSignedUrl(client, command, { expiresIn });
  }

  async getPresignedViewUrl(bucket: string, key: string, expiresIn: number = 3600): Promise<string> {
    const client = await this.getClientForBucket(bucket);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: 'inline'
    });

    return await getSignedUrl(client, command, { expiresIn });
  }

  async uploadObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    const client = await this.getClientForBucket(bucket);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    });

    await client.send(command);
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const client = await this.getClientForBucket(bucket);
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await client.send(command);
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const client = await this.getClientForBucket(bucket);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map(key => ({ Key: key }))
      }
    });    await client.send(command);
  }

  async deleteFolder(bucket: string, prefix: string): Promise<void> {
    const { objects } = await this.listObjects(bucket, prefix);
    const keys = objects.map(obj => obj.Key);

    if (keys.length > 0) {
      await this.deleteObjects(bucket, keys);
    }
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  getFileExtension(key: string): string {
    const parts = key.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  getFileName(key: string): string {
    return key.split('/').pop() || key;
  }

  getFolderName(prefix: string): string {
    const parts = prefix.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || prefix;
  }

  /**
   * Get the AWS region for a specific bucket
   */
  async getBucketRegion(bucket: string): Promise<string> {
    let region = this.bucketRegionCache.get(bucket);

    if (!region) {
      try {
        const command = new GetBucketLocationCommand({ Bucket: bucket });
        const response = await this.s3Client.send(command);
        // LocationConstraint is null for us-east-1
        region = response.LocationConstraint || 'us-east-1';
        this.bucketRegionCache.set(bucket, region);
      } catch (error) {
        console.warn(`Could not get region for bucket ${bucket}, using us-east-1 as fallback`, error);
        region = 'us-east-1';
      }
    }

    return region;
  }
}
