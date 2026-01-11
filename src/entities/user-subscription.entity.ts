import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { SubscriptionEntity } from './subscription.entity';
import { BillingCycle, SubscriptionStatus } from '@common/enums';
import { BaseDateModel } from '@common/models/base.model';

@Entity({ name: 'UserSubscription' })
export class UserSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp', nullable: false })
  startAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  endAt?: Date | null;

  @Column({ nullable: true })
  currency?: string;

  @Column({ type: 'enum', enum: BillingCycle, default: BillingCycle.MONTHLY })
  billingCycle: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: string;

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

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: SubscriptionEntity;

  constructor(partial: Partial<UserSubscriptionEntity>) {
    Object.assign(this, partial);
  }
}
