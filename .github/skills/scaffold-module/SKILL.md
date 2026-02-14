---
name: scaffold-module
description: Scaffold a new NestJS module with controller, service, models, and entity following project conventions. Use this when asked to create a new feature module or CRUD resource.
---

# Scaffold a New NestJS Module

Create a full feature module with CRUD operations following this project's conventions.

## Steps

1. **Create the entity** in `src/entities/{name}.entity.ts` using the [entity template](./entity.template.ts)
2. **Create the model file** in `src/modules/{name}/{name}.model.ts` using the [model template](./model.template.ts)
3. **Create the service** in `src/modules/{name}/{name}.service.ts` using the [service template](./service.template.ts)
4. **Create the controller** in `src/modules/{name}/{name}.controller.ts` using the [controller template](./controller.template.ts)
5. **Create the module** in `src/modules/{name}/{name}.module.ts` using the [module template](./module.template.ts)
6. **Register the module** by adding it to the `src/modules/index.ts` exports array

## Critical Conventions

- All class properties, columns, route paths, and method names use **PascalCase**
- Use path aliases: `@entities/*`, `@common/*`, `@modules/*`, `@decorators/*`
- Response models must have `@Expose()` on every property (ClassSerializerInterceptor uses `excludeExtraneousValues: true`)
- Use `@ApiSuccessResponse(Type)` for single-object endpoints, `@ApiSuccessArrayResponse(Type)` for lists
- Use `@ApiSuccessResponse('boolean')` for Create/Edit/Delete that return `boolean`
- For paginated lists, set `request.TotalRowCount` via `asyncLocalStorage` in the service
- Use `plainToInstance()` to convert entities to response models
- Entity constructors: `constructor(partial: Partial<T>) { Object.assign(this, partial); }`
- Soft delete via `@DeleteDateColumn()` and `repository.softDelete()`
