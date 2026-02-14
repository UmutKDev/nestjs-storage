import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

// Replace __Name__ with entity name (PascalCase)

@Entity({ name: '__Name__' })
export class __Name__Entity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Index()
  @Column({ unique: true })
  Name: string;

  @Column({ nullable: true })
  Description: string;

  // Add columns here. Use PascalCase names.
  // Examples:
  //   @Column({ type: 'enum', enum: MyEnum, default: MyEnum.VALUE }) Status: string;
  //   @Column({ type: 'bigint', default: 0 }) SizeBytes: number;
  //   @Column({ type: 'json', nullable: true }) Metadata?: Record<string, unknown>;
  //   @Column({ select: false }) SecretField: string;  // excluded from default queries

  get Date() {
    return {
      Created: this.CreatedAt,
      Updated: this.UpdatedAt,
    };
  }

  @CreateDateColumn()
  CreatedAt?: Date;

  @UpdateDateColumn()
  UpdatedAt?: Date;

  @DeleteDateColumn()
  DeletedAt?: Date;

  constructor(partial: Partial<__Name__Entity>) {
    Object.assign(this, partial);
  }
}
