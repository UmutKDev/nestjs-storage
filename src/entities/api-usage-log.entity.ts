import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { ApiKeyEntity } from './api-key.entity';

@Entity({ name: 'ApiUsageLog' })
export class ApiUsageLogEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Index()
  @Column({ type: 'uuid' })
  UserId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ApiKeyId: string;

  @Column({ type: 'varchar', length: 10 })
  Method: string;

  @Column({ type: 'varchar', length: 500 })
  Endpoint: string;

  @Column({ type: 'int' })
  StatusCode: number;

  @Column({ type: 'int' })
  ResponseTimeMs: number;

  @Column({ type: 'bigint', default: 0 })
  RequestBodyBytes: number;

  @Column({ type: 'bigint', default: 0 })
  ResponseBodyBytes: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  IpAddress: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  CountryCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  City: string;

  @Column({ type: 'float', nullable: true })
  Latitude: number;

  @Column({ type: 'float', nullable: true })
  Longitude: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  UserAgent: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  IdempotencyKey: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ApiVersion: string;

  @Index()
  @CreateDateColumn()
  CreatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'UserId' })
  User: UserEntity;

  @ManyToOne(() => ApiKeyEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'ApiKeyId' })
  ApiKey: ApiKeyEntity;

  constructor(partial: Partial<ApiUsageLogEntity>) {
    Object.assign(this, partial);
  }
}
