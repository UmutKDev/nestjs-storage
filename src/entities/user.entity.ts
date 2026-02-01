import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
  DeleteDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { UserSubscriptionEntity } from './user-subscription.entity';
import { Role, Status } from '@common/enums';
import { UserDateModel } from 'src/modules/user/user.model';

@Entity({ name: 'User' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Index({ fulltext: true })
  @Column({ unique: true })
  Email: string;

  @Index({ fulltext: true })
  @Column({ nullable: true, default: null })
  FullName: string;

  @Index({ fulltext: true })
  @Column({ nullable: true, default: null })
  PhoneNumber: string;

  @Column({ select: false })
  Password: string;

  @Column({ nullable: true, default: null })
  Image: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.USER,
  })
  Role: string;

  @Column({
    type: 'enum',
    enum: Status,
    default: Status.PENDING,
  })
  Status: string;

  get Date(): UserDateModel {
    return {
      Created: this.CreatedAt,
      Updated: this.UpdatedAt,
      LastLogin: this.LastLoginAt,
    };
  }

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  LastLoginAt?: Date;

  @CreateDateColumn()
  CreatedAt?: Date;

  @UpdateDateColumn()
  UpdatedAt?: Date;

  @DeleteDateColumn()
  DeletedAt?: Date;

  // user subscription (current only)
  @OneToOne(() => UserSubscriptionEntity, (us) => us.User)
  Subscription?: UserSubscriptionEntity;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
