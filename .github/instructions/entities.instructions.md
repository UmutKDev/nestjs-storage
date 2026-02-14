---
applyTo: 'src/entities/**/*.entity.ts'
---

# Entity Conventions

Every entity uses TypeORM decorators with PascalCase column names.

## Required Structure

```typescript
@Entity({ name: 'TableName' })
export class TableNameEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  // columns...

  @CreateDateColumn()
  CreatedAt?: Date;

  @UpdateDateColumn()
  UpdatedAt?: Date;

  constructor(partial: Partial<TableNameEntity>) {
    Object.assign(this, partial);
  }
}
```

- Use UUID primary keys via `@PrimaryGeneratedColumn('uuid')`.
- Add `@DeleteDateColumn() DeletedAt?: Date` for soft-deletable entities.
- Mark sensitive columns with `select: false` to exclude from default queries (e.g., `Password`).
- Use `@Index()` on frequently queried columns; `@Index({ fulltext: true })` for text search columns.
- Enum columns: `@Column({ type: 'enum', enum: MyEnum, default: MyEnum.VALUE })`.
- JSON columns: `@Column({ type: 'json', nullable: true })`.
- Relationships use `@ManyToOne(() => Target, { onDelete: 'CASCADE' })` with `@JoinColumn({ name: 'ForeignKeyId' })`.
- Reference existing entities in `src/entities/` — `user.entity.ts` is the canonical example.
