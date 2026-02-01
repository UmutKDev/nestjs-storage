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
} from 'typeorm';
import { UserEntity } from './user.entity';
import { SubscriptionEntity } from './subscription.entity';
import { BillingCycle, SubscriptionStatus } from '@common/enums';
import { BaseDateModel } from '@common/models/base.model';

@Entity({ name: 'UserSubscription' })
export class UserSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Column({ type: 'timestamp', nullable: false })
  StartAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  EndAt?: Date | null;

  @Column({ nullable: true })
  Currency?: string;

  @Column({
    type: 'enum',
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
  })
  BillingCycle: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  Status: string;

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

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'UserId' })
  User: UserEntity;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'SubscriptionId' })
  Subscription: SubscriptionEntity;

  constructor(partial: Partial<UserSubscriptionEntity>) {
    Object.assign(this, partial);
  }
}
