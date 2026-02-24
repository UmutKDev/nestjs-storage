import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { TeamMemberEntity } from './team-member.entity';
import { TeamInvitationEntity } from './team-invitation.entity';
import { TeamStatus } from '@common/enums';

@Entity({ name: 'Team' })
export class TeamEntity {
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

  @Column({ nullable: true, default: null })
  Image?: string;

  @Column({
    type: 'enum',
    enum: TeamStatus,
    default: TeamStatus.ACTIVE,
  })
  Status: string;

  // ── Subscription infrastructure (nullable, for future use) ──

  @Column({ type: 'bigint', nullable: true, default: null })
  StorageLimitBytes?: number | null;

  @Column({ type: 'bigint', nullable: true, default: null })
  MaxUploadSizeBytes?: number | null;

  @Column({ type: 'bigint', nullable: true, default: null })
  MaxObjectCount?: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  MaxMembers?: number | null;

  @Column({ type: 'json', nullable: true, default: null })
  Features?: Record<string, unknown> | null;

  // ── Relations ──

  @OneToMany(() => TeamMemberEntity, (tm) => tm.Team)
  Members?: TeamMemberEntity[];

  @OneToMany(() => TeamInvitationEntity, (ti) => ti.Team)
  Invitations?: TeamInvitationEntity[];

  // Future: TeamSubscriptionEntity
  // @OneToOne(() => TeamSubscriptionEntity, (ts) => ts.Team)
  // Subscription?: TeamSubscriptionEntity;

  // ── Timestamps ──

  @CreateDateColumn()
  CreatedAt?: Date;

  @UpdateDateColumn()
  UpdatedAt?: Date;

  @DeleteDateColumn()
  DeletedAt?: Date;

  constructor(partial: Partial<TeamEntity>) {
    Object.assign(this, partial);
  }
}
