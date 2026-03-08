import { Controller, Get, Param, Query } from '@nestjs/common';
import { S3Service } from '../services/s3.service';
import { HtmlGeneratorService } from '../services/html-generator.service';

@Controller('api/buckets')
export class BucketsController {
  constructor(
    private readonly s3Service: S3Service,
    private readonly htmlGenerator: HtmlGeneratorService
  ) {}

  @Get('/')
  async get() {
    try {
      const buckets = await this.s3Service.listBuckets();
      return this.htmlGenerator.generateBucketsListHtml(buckets);
    } catch (error) {
      console.error('Error listing buckets:', error);
      return this.htmlGenerator.generateErrorHtml('Failed to load buckets');
    }
  }

  @Get(':bucket/region')
  async getBucketRegion(@Param('bucket') bucket: string) {
    try {
      if (!bucket) {
        return { error: 'Bucket parameter is required' };
      }

      const region = await this.s3Service.getBucketRegion(bucket);
      return { region };
    } catch (error) {
      console.error('Error getting bucket region:', error);
      return { region: 'us-east-1' }; // fallback to us-east-1
    }
  }
}
