import { Controller, Post, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Service } from '../services/s3.service';

@Controller('api/upload')
export class UploadController {
  constructor(private readonly s3Service: S3Service) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: any,
    @Body('bucket') bucket: string,
    @Body('prefix') prefix?: string
  ) {
    try {
      const key = prefix ? `${prefix}${file.originalname}` : file.originalname;

      await this.s3Service.uploadObject(
        bucket,
        key,
        file.buffer,
        file.mimetype
      );      return {
        success: true,
        key,
        size: file.size
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }
}
