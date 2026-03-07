import { Injectable } from '@nestjs/common';
import * as geoip from 'geoip-lite';
import { RedisService } from '@modules/redis/redis.service';
import { ApiGeoKeys } from '@modules/redis/redis.keys';
import { API_GEO_CACHE_TTL } from '@modules/redis/redis.ttl';

export interface GeoData {
  CountryCode: string;
  City: string;
  Latitude: number;
  Longitude: number;
}

/** Regex that matches private / loopback IP ranges */
const PRIVATE_IP_REGEX =
  /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|fc00::|fe80::)$/i;

@Injectable()
export class ApiGeolocationService {
  constructor(private readonly RedisService: RedisService) {}

  /**
   * Resolve an IP address to geographic data.
   *
   * Private / loopback addresses are skipped. Results are cached in Redis
   * for `API_GEO_CACHE_TTL` seconds.
   */
  async Resolve(IpAddress: string): Promise<GeoData | null> {
    // ── Skip private / loopback IPs ────────────────────────────────────────
    if (!IpAddress || PRIVATE_IP_REGEX.test(IpAddress)) {
      return null;
    }

    // ── Check Redis cache ──────────────────────────────────────────────────
    const cacheKey = ApiGeoKeys.IpGeo(IpAddress);
    const cached = await this.RedisService.Get<GeoData>(cacheKey);

    if (cached) {
      return cached;
    }

    // ── Perform geoip lookup ───────────────────────────────────────────────
    const geo = geoip.lookup(IpAddress);

    if (!geo) {
      return null;
    }

    const geoData: GeoData = {
      CountryCode: geo.country,
      City: geo.city,
      Latitude: geo.ll[0],
      Longitude: geo.ll[1],
    };

    // ── Cache and return ───────────────────────────────────────────────────
    await this.RedisService.Set(cacheKey, geoData, API_GEO_CACHE_TTL);

    return geoData;
  }
}
