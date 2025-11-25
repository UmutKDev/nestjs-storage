import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserSubscriptionEntity } from './user-subscription.entity';
import { Role, Status } from '@common/enums';
import { UserDateModel } from 'src/modules/user/user.model';

@Entity({ name: 'User' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ fulltext: true })
  @Column({ unique: true })
  email: string;

  @Index({ fulltext: true })
  @Column({ nullable: true, default: null })
  fullName: string;

  @Index({ fulltext: true })
  @Column({ nullable: true, default: null })
  phoneNumber: string;

  @Column({ select: false })
  password: string;

  @Column({ nullable: true, default: null })
  avatar: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.USER,
  })
  role: string;

  @Column({
    type: 'enum',
    enum: Status,
    default: Status.PENDING,
  })
  status: string;

  get date(): UserDateModel {
    return {
      created: this.createdAt,
      updated: this.updatedAt,
      lastLogin: this.lastLoginAt,
    };
  }

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  lastLoginAt?: Date;

  @CreateDateColumn()
  createdAt?: Date;

  @UpdateDateColumn()
  updatedAt?: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  // user subscriptions (history + current)
  @OneToMany(() => UserSubscriptionEntity, (us) => us.user)
  subscriptions?: UserSubscriptionEntity[];

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
