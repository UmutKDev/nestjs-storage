import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import {
  ApiKeyEnvironment,
  ApiKeyScope,
} from '@common/enums/authentication.enum';

@Entity({ name: 'ApiKey' })
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Column({ type: 'varchar', length: 100 })
  Name: string;

  @Index()
  @Column({ type: 'varchar', length: 50, unique: true })
  PublicKey: string;

  @Column({ type: 'text' })
  SecretKeyHash: string;

  @Column({
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  SecretKeyPrefix: string;

  @Column({
    type: 'enum',
    enum: ApiKeyScope,
    array: true,
    default: [ApiKeyScope.READ],
  })
  Scopes: ApiKeyScope[];

  @Column({
    type: 'enum',
    enum: ApiKeyEnvironment,
    default: ApiKeyEnvironment.TEST,
  })
  Environment: ApiKeyEnvironment;

  @Column({ type: 'text', array: true, nullable: true })
  IpWhitelist: string[];

  @Column({ type: 'int', default: 100 })
  RateLimitPerMinute: number;

  @Column({ type: 'timestamp', nullable: true })
  LastUsedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  ExpiresAt: Date;

  @Column({ type: 'boolean', default: false })
  IsRevoked: boolean;

  @CreateDateColumn()
  CreatedAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'UserId' })
  User: UserEntity;

  constructor(partial: Partial<ApiKeyEntity>) {
    Object.assign(this, partial);
  }
}
