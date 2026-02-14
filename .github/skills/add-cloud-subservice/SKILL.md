---
name: add-cloud-subservice
description: Add a new sub-service to the Cloud module following the delegation pattern (e.g., thumbnails, sharing, versioning). Use this when asked to add a new cloud storage feature.
---

# Add a Cloud Sub-Service

The Cloud module uses a facade pattern: `CloudController` → `CloudService` (orchestrator) → specialized sub-services. Each sub-service handles one feature domain.

## Existing Sub-Services

| File                         | Responsibility            |
| ---------------------------- | ------------------------- |
| `cloud.s3.service.ts`        | AWS S3 client wrapper     |
| `cloud.list.service.ts`      | Directory/file listing    |
| `cloud.object.service.ts`    | Find, move, copy, delete  |
| `cloud.upload.service.ts`    | Multipart upload handling |
| `cloud.directory.service.ts` | Directory CRUD            |
| `cloud.usage.service.ts`     | Storage quota tracking    |
| `cloud.zip.service.ts`       | Zip extraction            |
| `cloud.scan.service.ts`      | Antivirus scanning        |
| `cloud.metadata.service.ts`  | File metadata processing  |

## Steps

1. **Create the sub-service** at `src/modules/cloud/cloud.{feature}.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { CloudS3Service } from './cloud.s3.service';

@Injectable()
export class Cloud{Feature}Service {
  constructor(
    private readonly CloudS3Service: CloudS3Service,
    // inject other sub-services or RedisService as needed
  ) {}

  async FeatureMethod(params, user: UserContext): Promise<ResultType> {
    // Use this.CloudS3Service for S3 operations
  }
}
```

2. **Register in cloud.module.ts** — Add to both `providers` and `exports` arrays

3. **Inject into CloudService** — Add as a `private readonly` constructor dependency

4. **Add delegation methods** in `CloudService`:

```typescript
async FeatureMethod(model, user, idempotencyKey?) {
  // Cross-cutting concerns: auth checks, encrypted folder access, idempotency
  const cached = await this.GetIdempotentResult(user.Id, 'feature', idempotencyKey);
  if (cached !== undefined) return cached;

  const result = await this.CloudFeatureService.FeatureMethod(model, user);

  await this.SetIdempotentResult(user.Id, 'feature', idempotencyKey, result);
  return result;
}
```

5. **Add controller endpoints** for the new feature in `cloud.controller.ts`

## Key Conventions

- Sub-services inject `CloudS3Service` for S3 operations, never use the AWS SDK directly
- The main `CloudService` handles cross-cutting concerns (auth, encrypted folder checks, idempotency caching)
- Controller stays thin — one method call to `CloudService` per endpoint
- Custom headers: `x-folder-session`, `x-folder-passphrase`, `idempotency-key`
