import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Relation,
} from 'typeorm';
import { DefinitionGroupEntity } from './definition-group.entity';
import { Definitions } from '@common/enums/definition.enum';
import { BaseDateModel } from '@common/models/base.model';

@Entity({ name: 'Definition' })
export class DefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Column({ unique: true, type: 'enum', enum: Definitions })
  Code: string;

  @Column()
  Value: string;

  @Column({ nullable: true, default: null })
  Description: string;

  @Column({ nullable: true, default: null })
  Image: string;

  @Column({ type: 'boolean', default: false })
  IsDefault: boolean;

  @Column({ type: 'boolean', default: false })
  IsSystem: boolean;

  @ManyToOne(() => DefinitionGroupEntity)
  @JoinColumn({ name: 'DefinitionGroupId' })
  DefinitionGroup: Relation<DefinitionGroupEntity>;

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
