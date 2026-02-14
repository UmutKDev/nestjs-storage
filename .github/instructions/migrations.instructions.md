---
applyTo: 'src/migrations/**/*.ts'
---

# Migration Conventions

## Creating Migrations

- Auto-generate from entity changes: `yarn migration:generate` — compares current entities against the database and produces a migration file.
- Empty migration for manual SQL: `yarn migration:create --name=DescriptiveName`
- Run: `yarn migration:run` (builds first then runs)
- Revert: `yarn migration:revert`

## Key Details

- DataSource config: `src/modules/database/database.datasource.ts`
- Database schema: `UmutKCDNSchema` — all tables live under this schema.
- Migrations run against compiled JS in `dist/`, so `migration:run` includes a build step.
- TypeORM CLI is invoked via `ts-node -r tsconfig-paths/register` to support path aliases.
