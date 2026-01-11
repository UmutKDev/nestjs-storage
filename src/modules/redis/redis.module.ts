import { CacheModule } from '@nestjs/cache-manager';
import { Module, Global } from '@nestjs/common';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisService } from './redis.service';

const REDIS_ENABLED =
  (process.env.REDIS_ENABLED ?? 'true').toLowerCase() !== 'false';

@Global()
@Module({
  imports: [
    // If REDIS is enabled, register Redis store; otherwise register default in-memory cache
    REDIS_ENABLED
      ? CacheModule.registerAsync({
          isGlobal: true,
          useFactory: async () => ({
            store: await redisStore({
              socket: {
                host: process.env.REDIS_HOSTNAME,
                port: parseInt(process.env.REDIS_PORT, 10),
              },
              password: process.env.REDIS_PASSWORD,
              ttl: parseInt(process.env.REDIS_TTL, 10) * 1000, // default 5 minutes in ms
            }),
          }),
        })
      : CacheModule.register({
          isGlobal: true,
          ttl: parseInt(process.env.REDIS_TTL, 10), // seconds for in-memory cache
        }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisModule {}
