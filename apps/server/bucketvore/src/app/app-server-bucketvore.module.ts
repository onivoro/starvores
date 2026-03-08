import { Module } from '@nestjs/common';
import { AppController } from './controllers/app.controller';
import { BucketsController } from './controllers/buckets.controller';
import { FilesController } from './controllers/files.controller';
import { UploadController } from './controllers/upload.controller';
import { AppServerBucketvoreConfig } from './app-server-bucketvore-config.class';
import { S3Client } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import { S3Service } from './services/s3.service';
import { HtmlGeneratorService } from './services/html-generator.service';
import { FilePreviewService } from './services/file-preview.service';

const bucketvoreConfig = new AppServerBucketvoreConfig();

@Module({
  imports: [],
  controllers: [
    AppController,
    BucketsController,
    FilesController,
    UploadController,
  ],
  providers: [
    S3Service,
    HtmlGeneratorService,
    FilePreviewService,
    { provide: AppServerBucketvoreConfig, useValue: bucketvoreConfig },
    {
      provide: S3Client,
      useFactory: () => {
        const clientConfig: any = {
          region: 'us-east-1', // Default region for initial client (bucket regions are auto-detected)
        };

        if (bucketvoreConfig.AWS_PROFILE) {
          clientConfig.credentials = fromIni({ profile: bucketvoreConfig.AWS_PROFILE });
        }

        return new S3Client(clientConfig);
      }
    }
  ]
})
export class AppServerBucketvoreModule {}
