import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { WebhookDeliveryEntity } from './webhook-delivery.entity';
import { WebhookEvent } from '@common/enums/api.enum';

@Entity({ name: 'Webhook' })
@Unique(['UserId', 'Url'])
export class WebhookEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Index()
  @Column({ type: 'uuid' })
  UserId: string;

  @Column({ type: 'varchar', length: 200 })
  Name: string;

  @Column({ type: 'varchar', length: 2048 })
  Url: string;

  @Column({ type: 'text' })
  Secret: string;

  @Column({
    type: 'enum',
    enum: WebhookEvent,
    array: true,
    default: [],
  })
  Events: WebhookEvent[];

  @Column({ type: 'boolean', default: true })
  IsActive: boolean;

  @Column({ type: 'int', default: 3 })
  MaxRetries: number;

  @Column({ type: 'int', default: 30 })
  TimeoutSeconds: number;

  @Column({ type: 'json', nullable: true })
  Headers: Record<string, string>;

  @Column({ type: 'timestamp', nullable: true })
  LastDeliveredAt: Date;

  @Column({ type: 'int', default: 0 })
  ConsecutiveFailures: number;

  @CreateDateColumn()
  CreatedAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;

  @DeleteDateColumn()
  DeletedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'UserId' })
  User: UserEntity;

  @OneToMany(() => WebhookDeliveryEntity, (d) => d.Webhook)
  Deliveries: WebhookDeliveryEntity[];

  constructor(partial: Partial<WebhookEntity>) {
    Object.assign(this, partial);
  }
}
