import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserSubscriptionEntity } from './user-subscription.entity';
import { BillingCycle, SubscriptionStatus } from '@common/enums';
import { BaseDateModel } from '@common/models/base.model';

@Entity({ name: 'Subscription' })
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Index()
  @Column({ unique: true })
  Name: string;

  @Index()
  @Column({ unique: true })
  Slug: string;

  @Column({ type: 'text', nullable: true, default: null })
  Description?: string;

  // Price stored as cents to avoid floating point issues
  @Column({ default: 0 })
  Price: number;

  @Column({ nullable: false, default: 'USD' })
  Currency: string;

  @Column({
    type: 'enum',
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
  })
  BillingCycle: string;

  // Storage limits in bytes; 0 means unlimited
  @Column({
    type: 'bigint',
    default: 5 * 1024 * 1024 * 1024,
  }) // 5 GB
  StorageLimitBytes: number;

  @Column({
    type: 'bigint',
    nullable: true,
    default: 50 * 1024 * 1024,
  })
  MaxUploadSizeBytes?: number | null;

  @Column({
    type: 'bigint',
    nullable: true,
    default: null,
  })
  MaxObjectCount?: number | null;

  @Column({ type: 'json', nullable: true })
  Features?: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  Status: string;

  constructor(partial: Partial<SubscriptionEntity>) {
    Object.assign(this, partial);
  }

  get Date(): BaseDateModel {
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

  @OneToMany(() => UserSubscriptionEntity, (us) => us.Subscription)
  Users?: UserSubscriptionEntity[];
}
