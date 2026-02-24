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
import { TeamEntity } from './team.entity';
import { UserEntity } from './user.entity';
import { TeamRole, TeamInvitationStatus } from '@common/enums';

@Entity({ name: 'TeamInvitation' })
@Index(['Team', 'Email'], { unique: true, where: `"Status" = 'PENDING'` })
export class TeamInvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Column()
  Email: string;

  @Column({
    type: 'enum',
    enum: TeamRole,
    default: TeamRole.MEMBER,
  })
  Role: string;

  @Column({
    type: 'enum',
    enum: TeamInvitationStatus,
    default: TeamInvitationStatus.PENDING,
  })
  Status: string;

  @Column({ type: 'uuid', unique: true })
  Token: string;

  @Column({ type: 'timestamp' })
  ExpiresAt: Date;

  @ManyToOne(() => TeamEntity, (team) => team.Invitations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'TeamId' })
  Team: TeamEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'InvitedById' })
  InvitedBy?: UserEntity;

  @CreateDateColumn()
  CreatedAt?: Date;

  @UpdateDateColumn()
  UpdatedAt?: Date;

  constructor(partial: Partial<TeamInvitationEntity>) {
    Object.assign(this, partial);
  }
}
