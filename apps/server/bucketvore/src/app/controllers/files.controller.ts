import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { S3Service } from '../services/s3.service';
import { FilePreviewService } from '../services/file-preview.service';

@Controller('api/files')
export class FilesController {
  constructor(
    private readonly s3Service: S3Service,
    private readonly filePreviewService: FilePreviewService
  ) {}

  @Get()
  async listFiles(
    @Query('bucket') bucket: string,
    @Query('prefix') prefix?: string
  ) {
    const { objects, commonPrefixes } = await this.s3Service.listObjects(bucket, prefix);

    return {
      objects: objects.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified?.toISOString(),
      })),
      folders: commonPrefixes,
      prefix: prefix || '',
    };
  }

  @Get('preview')
  async previewFile(
    @Query('bucket') bucket: string,
    @Query('key') key: string
  ) {
    const extension = this.s3Service.getFileExtension(key);
    const previewType = this.filePreviewService.getPreviewType(extension);
    const metadata = await this.s3Service.getObjectMetadata(bucket, key);

    let content: string | undefined;
    let presignedUrl: string | undefined;

    if (previewType === 'text') {
      const { body } = await this.s3Service.getObject(bucket, key);
      const text = await this.filePreviewService.generateTextPreview(body);
      content = extension === 'json' ? this.filePreviewService.formatJson(text) : text;
    } else if (previewType !== 'none') {
      presignedUrl = await this.s3Service.getPresignedViewUrl(bucket, key);
    }

    return {
      key,
      fileName: this.s3Service.getFileName(key),
      previewType,
      content,
      presignedUrl,
      metadata: {
        contentLength: metadata.ContentLength,
        contentType: metadata.ContentType,
        lastModified: metadata.LastModified?.toISOString(),
      },
    };
  }

  @Get('download')
  async downloadFile(
    @Query('bucket') bucket: string,
    @Query('key') key: string
  ) {
    const url = await this.s3Service.getPresignedDownloadUrl(bucket, key);
    return { url };
  }

  @Post('delete')
  async deleteFile(@Body() body: { bucket: string; key: string }) {
    await this.s3Service.deleteObject(body.bucket, body.key);
    return { success: true };
  }

  @Post('delete-folder')
  async deleteFolder(@Body() body: { bucket: string; prefix: string }) {
    await this.s3Service.deleteFolder(body.bucket, body.prefix);
    return { success: true };
  }
}
