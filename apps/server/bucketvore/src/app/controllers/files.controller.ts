import { Controller, Get, Post, Query, Body, Res } from '@nestjs/common';
import { S3Service } from '../services/s3.service';
import { HtmlGeneratorService } from '../services/html-generator.service';
import { FilePreviewService } from '../services/file-preview.service';

@Controller('api/files')
export class FilesController {
  constructor(
    private readonly s3Service: S3Service,
    private readonly htmlGenerator: HtmlGeneratorService,
    private readonly filePreviewService: FilePreviewService
  ) {}

  @Get()
  async listFiles(
    @Query('bucket') bucket: string,
    @Query('prefix') prefix?: string
  ) {
    try {
      const { objects, commonPrefixes } = await this.s3Service.listObjects(bucket, prefix);

      const filesHtml = this.htmlGenerator.generateFileListHtml(
        objects,
        commonPrefixes,
        this.s3Service,
        prefix
      );

      const breadcrumbsHtml = this.htmlGenerator.generateBreadcrumbs(prefix || '', bucket);

      return {
        filesHtml,
        breadcrumbsHtml,
        objects: objects.length,
        folders: commonPrefixes.length
      };
    } catch (error) {
      console.error('Error listing files:', error);
      return {
        filesHtml: this.htmlGenerator.generateErrorHtml('Failed to load files'),
        breadcrumbsHtml: '',
        objects: 0,
        folders: 0
      };
    }
  }

  @Get('preview')
  async previewFile(
    @Query('bucket') bucket: string,
    @Query('key') key: string
  ) {
    try {
      const extension = this.s3Service.getFileExtension(key);
      const previewType = this.filePreviewService.getPreviewType(extension);
      const metadata = await this.s3Service.getObjectMetadata(bucket, key);

      let content: any = null;
      let presignedUrl: string | undefined;

      if (previewType === 'text') {
        const { body } = await this.s3Service.getObject(bucket, key);
        content = Buffer.from(body);
      } else if (previewType !== 'none') {
        presignedUrl = await this.s3Service.getPresignedViewUrl(bucket, key);
      }

      return this.htmlGenerator.generateFilePreviewHtml(
        key,
        previewType,
        content,
        metadata,
        this.s3Service,
        presignedUrl
      );
    } catch (error) {
      console.error('Error previewing file:', error);
      return this.htmlGenerator.generateErrorHtml('Failed to load preview');
    }
  }

  @Get('download')
  async downloadFile(
    @Query('bucket') bucket: string,
    @Query('key') key: string
  ) {
    try {
      const url = await this.s3Service.getPresignedDownloadUrl(bucket, key);
      return { url };
    } catch (error) {
      console.error('Error generating download URL:', error);
      throw error;
    }
  }

  @Post('delete')
  async deleteFile(@Body() body: { bucket: string; key: string }) {
    try {
      await this.s3Service.deleteObject(body.bucket, body.key);
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  @Post('delete-folder')
  async deleteFolder(@Body() body: { bucket: string; prefix: string }) {
    try {
      await this.s3Service.deleteFolder(body.bucket, body.prefix);
      return { success: true };
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  }
}
