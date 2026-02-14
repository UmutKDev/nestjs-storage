---
name: add-entity
description: Create a new TypeORM entity with proper conventions (PascalCase columns, UUID PK, timestamps, soft delete). Use this when asked to add a database table or entity.
---

# Add a TypeORM Entity

## Steps

1. Create `src/entities/{kebab-name}.entity.ts` following the patterns below
2. Import and register the entity in the relevant module's `TypeOrmModule.forFeature([...])` array
3. Generate a migration: `yarn migration:generate`
4. Review and run: `yarn migration:run`

## Entity Structure

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'TableName' })
export class TableNameEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  // Columns use PascalCase — e.g., @Column() FullName: string;

  get Date() {
    return { Created: this.CreatedAt, Updated: this.UpdatedAt };
  }

  @CreateDateColumn()
  CreatedAt?: Date;

  @UpdateDateColumn()
  UpdatedAt?: Date;

  @DeleteDateColumn()
  DeletedAt?: Date;

  constructor(partial: Partial<TableNameEntity>) {
    Object.assign(this, partial);
  }
}
```

## Column Patterns

- Enum: `@Column({ type: 'enum', enum: MyEnum, default: MyEnum.VALUE })`
- JSON: `@Column({ type: 'json', nullable: true })`
- BigInt: `@Column({ type: 'bigint', default: 0 })`
- Hidden: `@Column({ select: false })` — excluded from default SELECT
- Unique + indexed: `@Index() @Column({ unique: true })`
- Fulltext search: `@Index({ fulltext: true }) @Column()`
- Array: `@Column({ type: 'text', array: true, nullable: true })`

## Relations

- `@ManyToOne(() => ParentEntity, { onDelete: 'CASCADE' })` with `@JoinColumn({ name: 'ParentId' })`
- `@OneToOne(() => Related, (r) => r.BackRef)` with `@JoinColumn()`
- `@OneToMany(() => Child, (c) => c.Parent)`

## Reference

See `src/entities/user.entity.ts` for all patterns including relations, getters, enums, and soft deletes.
