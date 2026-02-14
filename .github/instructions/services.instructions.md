---
applyTo: 'src/modules/**/*.service.ts'
---

# Service Conventions

## Dependency Injection

Always use constructor injection with `private readonly`:

```typescript
@Injectable()
export class MyService {
  constructor(
    @InjectRepository(MyEntity)
    private readonly MyRepository: Repository<MyEntity>,
    private readonly RedisService: RedisService,
  ) {}
}
```

## Key Patterns

- Large services split into sub-services (see `src/modules/cloud/` — 8 service files). The main service acts as a facade.
- Throw `HttpException` with appropriate `HttpStatus` for business logic errors — the global `HttpExceptionFilter` formats the response and reports to Sentry.
- For operations that accept an `idempotency-key` header, check Redis cache before executing and store the result after. See `CloudService.Move()` for the pattern.
- Access the current request via `asyncLocalStorage.getStore()?.get('request')` when not in a controller context (e.g., for setting `request.TotalRowCount` in list services).
