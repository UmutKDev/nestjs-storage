import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { TeamEntity } from './team.entity';
import { UserEntity } from './user.entity';
import { TeamRole } from '@common/enums';

@Entity({ name: 'TeamMember' })
@Unique(['Team', 'User'])
export class TeamMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Column({
    type: 'enum',
    enum: TeamRole,
    default: TeamRole.MEMBER,
  })
  Role: string;

  @Column({ type: 'timestamp', nullable: true, default: null })
  JoinedAt?: Date;

  @ManyToOne(() => TeamEntity, (team) => team.Members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'TeamId' })
  Team: TeamEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'UserId' })
  User: UserEntity;

  @CreateDateColumn()
  CreatedAt?: Date;

  @UpdateDateColumn()
  UpdatedAt?: Date;

  constructor(partial: Partial<TeamMemberEntity>) {
    Object.assign(this, partial);
  }
}
