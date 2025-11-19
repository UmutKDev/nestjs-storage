import './instrument';
import { NestFactory, Reflector } from '@nestjs/core';
import { CoreModule } from './modules/core/core.module';
import {
  ClassSerializerInterceptor,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { RequestContextMiddleware } from './common/context/context.middleware';
import { apiReference } from '@scalar/nestjs-api-reference';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { useContainer } from 'class-validator';
import basicAuth from 'express-basic-auth';

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(CoreModule, {
    cors: true,
    logger: ['error', 'warn', 'log', 'fatal'],
  });
  app.set('query parser', 'extended');

  app.enableVersioning({ type: VersioningType.URI });

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      skipMissingProperties: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('/Api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: '/health', method: RequestMethod.GET },
    ],
  });

  app.use(RequestContextMiddleware);

  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: true,
      exposeDefaultValues: true,
    }),
  );

  useContainer(app.select(CoreModule), { fallbackOnErrors: true });

  if (process.env.NODE_ENV === 'production') {
    app.use(
      ['/swagger', '/swagger-json', '/reference'],
      basicAuth({ challenge: true, users: { admin: 'j?H8.Ekv2B8X' } }),
    );
  }

  const document = SwaggerModule.createDocument(app, SwaggerConfig, {
    operationIdFactory: (_, methodKey) => methodKey,
  });
  SwaggerModule.setup('swagger', app, document);

  app.use('/reference', apiReference({ spec: { content: document } }));

  await app.listen(process.env.PORT || 8080);
}

const SwaggerConfig = new DocumentBuilder()
  .setTitle('Base API Service')

  .setDescription('Base API Service Test Environment & Documentation')
  .setVersion('1.0')
  .addBearerAuth()
  .addTag('Home')
  .addTag('Health')
  .addTag('Authentication')
  .addTag('Account')
  .addTag('User')
  .addTag('Definition')
  .addTag('Cloud')
  .build();

bootstrap();
