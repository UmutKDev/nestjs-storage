---
name: add-endpoint
description: Add a new API endpoint to an existing module with proper controller method, service logic, and request/response models. Use this when asked to add an endpoint or API route.
---

# Add an API Endpoint

## Steps

1. **Define the models** — Add request/response DTOs in `src/modules/{module}/{module}.model.ts`
2. **Add the service method** in `src/modules/{module}/{module}.service.ts`
3. **Add the controller method** in `src/modules/{module}/{module}.controller.ts`

## Controller Method Pattern

```typescript
@Get('ActionName')              // PascalCase route path
@ApiOperation({ summary: 'Short description' })
@ApiSuccessResponse(ActionResponseModel)   // or @ApiSuccessArrayResponse for lists
async ActionName(
  @Query() model: ActionRequestModel,      // GET params
  @User() user: UserContext,               // authenticated user
): Promise<ActionResponseModel> {
  return this.service.ActionName(model, user);
}
```

- `@Get`, `@Post`, `@Put`, `@Delete` — route paths are PascalCase
- `@ApiSuccessResponse(Type)` for single objects, `@ApiSuccessArrayResponse(Type)` for arrays
- `@ApiSuccessResponse('boolean')` for mutations returning `true`
- `@Body()` for POST/PUT payloads, `@Query()` for GET params, `@Param()` for URL params
- Add `@Roles(Role.ADMIN)` for admin-only, `@Public()` for unauthenticated access

## Response Model Pattern

Every property must have both `@Expose()` and `@ApiProperty()`:

```typescript
export class ActionResponseModel {
  @Expose()
  @ApiProperty()
  FieldName: string;
}
```

## Request Model Pattern

Every property needs `class-validator` decorator + `@ApiProperty()`:

```typescript
export class ActionRequestModel {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  Id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  Filter?: string;
}
```

## Service for List Endpoints

For paginated lists, set the total count via asyncLocalStorage:

```typescript
const store = asyncLocalStorage.getStore();
const request: Request = store?.get('request');
const [result, count] = await queryBuilder.getManyAndCount();
request.TotalRowCount = count;
return plainToInstance(ResponseModel, result);
```
