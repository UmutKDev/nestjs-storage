---
applyTo: 'src/**/*.model.ts,src/**/*.dto.ts'
---

# DTO / Model Conventions

## Naming

- Input DTOs: `*RequestModel` (e.g., `CloudListRequestModel`)
- Output DTOs: `*ResponseModel` (e.g., `CloudListResponseModel`)

## Structure

Every property needs both a `class-validator` decorator and `@ApiProperty()`:

```typescript
export class MyRequestModel {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  Id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  Search?: string;
}
```

## Key Rules

- The global `ValidationPipe` uses `whitelist: true` and `forbidNonWhitelisted: true` — unknown properties are rejected. All accepted properties must be decorated.
- `enableImplicitConversion: true` is active — query string values are auto-converted to the declared type. No need for explicit `@Type()` on primitives.
- For paginated lists, extend `PaginationRequestModel` from `@common/models/pagination.model.ts`.
- Use the `@Match('OtherField')` decorator from `@common/decorators/match.decorator` for field comparison (e.g., password confirmation).
- Response models use `@Expose()` from `class-transformer` because `ClassSerializerInterceptor` runs with `excludeExtraneousValues: true`.
