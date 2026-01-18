import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { AwsSdkModule } from 'aws-sdk-v3-nest';
import { Agent } from 'https';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@modules/redis/redis.module';
import { CloudS3Service } from './cloud.s3.service';
import { CloudMetadataService } from './cloud.metadata.service';
import { CloudListService } from './cloud.list.service';
import { CloudObjectService } from './cloud.object.service';
import { CloudZipService } from './cloud.zip.service';
import { CloudUploadService } from './cloud.upload.service';
import { CloudDirectoryService } from './cloud.directory.service';
import { CloudUsageService } from './cloud.usage.service';

@Module({
  imports: [
    RedisModule,
    AwsSdkModule.register({
      client: new S3Client({
        forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
        endpoint: process.env.STORAGE_S3_ENDPOINT,
        region: process.env.STORAGE_S3_REGION,
        credentials: {
          accessKeyId: process.env.S3_PROTOCOL_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_PROTOCOL_ACCESS_KEY_SECRET,
        },
        requestHandler: {
          httpsAgent: new Agent({ keepAlive: false }),
        },
      }),
    }),
    TypeOrmModule.forFeature([UserSubscriptionEntity]),
  ],
  controllers: [CloudController],
  providers: [
    CloudService,
    CloudS3Service,
    CloudMetadataService,
    CloudListService,
    CloudObjectService,
    CloudZipService,
    CloudUploadService,
    CloudDirectoryService,
    CloudUsageService,
  ],
  exports: [
    CloudService,
    CloudS3Service,
    CloudMetadataService,
    CloudListService,
    CloudObjectService,
    CloudZipService,
    CloudUploadService,
    CloudDirectoryService,
    CloudUsageService,
  ],
})
export class CloudModule {}
