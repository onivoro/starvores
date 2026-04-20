import { Module } from '@nestjs/common';
import { AppController } from './controllers/app.controller';
import { BucketsController } from './controllers/buckets.controller';
import { FilesController } from './controllers/files.controller';
import { UploadController } from './controllers/upload.controller';
import { S3Service } from './services/s3.service';
import { FilePreviewService } from './services/file-preview.service';
import { AppServerBucketvoreConfig } from './app-server-bucketvore-config.class';
import { S3Client } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';

@Module({
  imports: [],
  controllers: [AppController, BucketsController, FilesController, UploadController],
  providers: [
    S3Service,
    FilePreviewService,
    {
      provide: AppServerBucketvoreConfig,
      useValue: new AppServerBucketvoreConfig(),
    },
    {
      provide: S3Client,
      useFactory: () => {
        const config = new AppServerBucketvoreConfig();
        const clientConfig: any = { region: 'us-east-1' };
        if (config.AWS_PROFILE) {
          clientConfig.credentials = fromIni({ profile: config.AWS_PROFILE });
        }
        return new S3Client(clientConfig);
      },
    },
  ],
})
export class AppServerBucketvoreModule {}
