import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity({ name: 'Passkey' })
export class PasskeyEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Column({ type: 'text', unique: true })
  CredentialId: string;

  @Column({ type: 'text' })
  PublicKey: string;

  @Column({ type: 'bigint', default: 0 })
  Counter: number;

  @Column({ type: 'varchar', length: 255 })
  DeviceName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  DeviceType: string;

  @Column({ type: 'text', nullable: true })
  Transports: string;

  @Column({ type: 'timestamp', nullable: true })
  LastUsedAt: Date;

  @CreateDateColumn()
  CreatedAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'userId' })
  User: UserEntity;

  constructor(partial: Partial<PasskeyEntity>) {
    Object.assign(this, partial);
  }
}
