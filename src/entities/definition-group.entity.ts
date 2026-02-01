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
  Id: string;

  @Column({ unique: true, type: 'enum', enum: DefinitionGroups })
  Code: string;

  @Column({ nullable: true })
  Description: string;

  @Column({ type: 'boolean', default: false })
  IsCommon: boolean;

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
}
