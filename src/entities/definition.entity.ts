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
  id: string;

  @Column({ unique: true, type: 'enum', enum: Definitions })
  code: string;

  @Column()
  value: string;

  @Column({ nullable: true, default: null })
  description: string;

  @Column({ nullable: true, default: null })
  image: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @ManyToOne(() => DefinitionGroupEntity)
  @JoinColumn()
  definitionGroup: Relation<DefinitionGroupEntity>;

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
