import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { AwsSdkModule } from 'aws-sdk-v3-nest';
import { Agent } from 'https';

@Module({
  imports: [
    AwsSdkModule.register({
      client: new S3Client({
        forcePathStyle: false,
        endpoint: process.env.AWS_CLOUDFRONT_ENDPOINT,
        region: 'auto',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        requestHandler: {
          httpsAgent: new Agent({ keepAlive: false }),
        },
      }),
    }),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class CloudModule {}
