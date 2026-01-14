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
  id: string;

  @Index()
  @Column({ unique: true })
  name: string;

  @Index()
  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true, default: null })
  description?: string;

  // Price stored as cents to avoid floating point issues
  @Column({ default: 0 })
  price: number;

  @Column({ nullable: false, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: BillingCycle, default: BillingCycle.MONTHLY })
  billingCycle: string;

  // Storage limits in bytes; 0 means unlimited
  @Column({ type: 'bigint', default: 5 * 1024 * 1024 * 1024 }) // 5 GB
  storageLimitBytes: number;

  @Column({ type: 'bigint', nullable: true, default: 50 * 1024 * 1024 })
  maxUploadSizeBytes?: number | null;

  @Column({ type: 'bigint', nullable: true, default: null })
  maxObjectCount?: number | null;

  @Column({ type: 'json', nullable: true })
  features?: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: string;

  constructor(partial: Partial<SubscriptionEntity>) {
    Object.assign(this, partial);
  }

  get date(): BaseDateModel {
    return {
      created: this.createdAt,
      updated: this.updatedAt,
    };
  }

  @CreateDateColumn()
  createdAt?: Date;

  @UpdateDateColumn()
  updatedAt?: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  @OneToMany(() => UserSubscriptionEntity, (us) => us.subscription)
  users?: UserSubscriptionEntity[];
}
