import { CacheModule } from '@nestjs/cache-manager';
import { Module, Global, Logger } from '@nestjs/common';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisService } from './redis.service';

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const REDIS_ENABLED =
  (process.env.REDIS_ENABLED ?? 'true').toLowerCase() !== 'false';

@Global()
@Module({
  imports: [
    // If REDIS is enabled, register Redis store; otherwise register default in-memory cache
    REDIS_ENABLED
      ? CacheModule.registerAsync({
          isGlobal: true,
          useFactory: async () => {
            const logger = new Logger('RedisModule');
            logger.log(
              'Using Redis store - sessions will persist across restarts',
            );
            return {
              store: await redisStore({
                socket: {
                  host: process.env.REDIS_HOSTNAME,
                  port: parseInt(process.env.REDIS_PORT, 10),
                },
                password: process.env.REDIS_PASSWORD,
                ttl: parseInt(process.env.REDIS_TTL, 10) * 1000, // default 5 minutes in ms
              }),
            };
          },
        })
      : CacheModule.register({
          isGlobal: true,
          ttl: parseInt(process.env.REDIS_TTL, 10), // seconds for in-memory cache
        }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisModule {
  private readonly logger = new Logger(RedisModule.name);

  constructor() {
    if (!REDIS_ENABLED && IS_DEVELOPMENT) {
      this.logger.warn(
        '⚠️  In-memory cache is being used. Sessions will be lost on restart!',
      );
      this.logger.warn(
        '   To persist sessions in development, set REDIS_ENABLED=true and configure Redis.',
      );
    }
  }
}
