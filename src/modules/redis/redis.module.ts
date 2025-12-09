import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
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
    }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisModule {}
