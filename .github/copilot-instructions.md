---
applyTo: '**'
---

# Project: nestjs-storage

NestJS cloud storage backend with PostgreSQL (TypeORM), Redis, and S3-compatible object storage.

## Structure

- `src/modules/` — Feature modules (cloud, authentication, account, subscription, definition, health, redis, mail)
- `src/common/` — Shared decorators, enums, filters, helpers, interceptors, models, templates
- `src/entities/` — TypeORM entities
- `src/migrations/` — TypeORM migrations
- `src/subscribers/` — TypeORM event subscribers (e.g., auto password hashing)

## Naming — PascalCase Everywhere

Use PascalCase for class properties, entity columns, DTO fields, method names, and route paths. This is a project-wide convention that differs from typical camelCase JS/TS style.

```typescript
// Correct
@Column() LastLoginAt: Date;
@Get('List') async List() {}
model.SourceKeys

// Wrong
@Column() lastLoginAt: Date;
@Get('list') async list() {}
model.sourceKeys
```

## Naming Suffixes

- Models: `*RequestModel` / `*ResponseModel` — e.g., `CloudListRequestModel`
- Entities: `*Entity` — e.g., `UserEntity`
- Enums: string values in UPPERCASE — e.g., `Role.ADMIN`, `Status.ACTIVE`

## Path Aliases

Always use path aliases instead of relative imports. Defined in `tsconfig.json`:

```typescript
import { Role } from '@common/enums';
import { UserEntity } from '@entities/user.entity';
import { CloudService } from '@modules/cloud/cloud.service';
```

## Response Format

All endpoints return a wrapped response via `TransformInterceptor`. Never construct this wrapper manually — just return the data.

- Single object: `{ Result: T, Status: { Messages, Code, Timestamp, Path } }`
- Array: `{ Result: { Options: {pagination}, Items: T[] }, Status }`

## Swagger Documentation

Use custom response decorators from `@common/decorators/response.decorator`, not raw `@ApiOkResponse`. They generate the correct wrapped schema.

```typescript
@ApiSuccessResponse(MyResponseModel)        // single object
@ApiSuccessArrayResponse(MyItemModel)        // paginated array
```

## Auth Decorators

Routes are authenticated by default via global `CombinedAuthGuard`. Use these decorators to modify behavior:

- `@Public()` — skip auth entirely
- `@Roles(Role.ADMIN)` — require specific role
- `@Scopes(ApiKeyScope.READ)` — require API key scope
- `@Require2FA()` — require completed 2FA verification

User context is injected via `@User()` decorator returning `UserContext`.

## Password Handling

Never hash passwords manually. `UserSubscriber` (`src/subscribers/user.subscriber.ts`) automatically hashes via argon2 on insert/update.

## Commands

```bash
yarn start:dev                        # Dev with watch
yarn start:debug                      # Debug (port 9229)
yarn lint                             # ESLint + auto-fix
yarn test:unit                        # Unit tests (*.spec.ts)
yarn test:integration                 # Integration tests (*.e2e-spec.ts)
yarn migration:create --name=Name     # New empty migration
yarn migration:generate               # Auto-generate from entity diff
yarn migration:run                    # Build + run pending migrations
```

## Local Dev

`docker-compose.yml` provides PostgreSQL, Redis, and MinIO (S3) on a bridge network. Backend runs on port 8080 with global prefix `/Api`. Swagger UI at `/swagger`.
