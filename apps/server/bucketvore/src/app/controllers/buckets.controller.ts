import { Controller, Get, Param } from '@nestjs/common';
import { S3Service } from '../services/s3.service';

@Controller('api/buckets')
export class BucketsController {
  constructor(private readonly s3Service: S3Service) {}

  @Get()
  async listBuckets() {
    return this.s3Service.listBuckets();
  }

  @Get(':bucket/region')
  async getBucketRegion(@Param('bucket') bucket: string) {
    const region = await this.s3Service.getBucketRegion(bucket);
    return { region };
  }
}
