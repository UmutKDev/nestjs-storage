import { DefinitionGroups } from '@common/enums/definition.enum';
import { BaseDateModel } from '@common/models/base.model';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'DefinitionGroup' })
export class DefinitionGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, type: 'enum', enum: DefinitionGroups })
  code: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'boolean', default: false })
  isCommon: boolean;

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
}
