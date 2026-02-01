import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { TwoFactorMethod } from '@common/enums/authentication.enum';

@Entity({ name: 'TwoFactor' })
export class TwoFactorEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Index()
  @Column({ type: 'uuid', unique: true })
  UserId: string;

  @Column({
    type: 'enum',
    enum: TwoFactorMethod,
    default: TwoFactorMethod.TOTP,
  })
  Method: TwoFactorMethod;

  @Column({ type: 'text', nullable: true })
  Secret: string;

  @Column({ type: 'text', array: true, default: [] })
  BackupCodes: string[];

  @Column({ type: 'boolean', default: false })
  IsEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  IsVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  LastVerifiedAt: Date;

  @CreateDateColumn()
  CreatedAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'UserId' })
  User: UserEntity;

  constructor(partial: Partial<TwoFactorEntity>) {
    Object.assign(this, partial);
  }
}
