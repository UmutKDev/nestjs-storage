import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WebhookEntity } from './webhook.entity';
import { WebhookEvent, WebhookDeliveryStatus } from '@common/enums/api.enum';

@Entity({ name: 'WebhookDelivery' })
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  Id: string;

  @Index()
  @Column({ type: 'uuid' })
  WebhookId: string;

  @Column({
    type: 'enum',
    enum: WebhookEvent,
  })
  Event: WebhookEvent;

  @Column({ type: 'json' })
  Payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: WebhookDeliveryStatus,
    default: WebhookDeliveryStatus.PENDING,
  })
  Status: WebhookDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  AttemptCount: number;

  @Column({ type: 'int', nullable: true })
  HttpStatusCode: number;

  @Column({ type: 'text', nullable: true })
  ResponseBody: string;

  @Column({ type: 'int', nullable: true })
  ResponseTimeMs: number;

  @Column({ type: 'text', nullable: true })
  ErrorMessage: string;

  @Column({ type: 'timestamp', nullable: true })
  NextRetryAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  DeliveredAt: Date;

  @CreateDateColumn()
  CreatedAt: Date;

  @ManyToOne(() => WebhookEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'WebhookId' })
  Webhook: WebhookEntity;

  constructor(partial: Partial<WebhookDeliveryEntity>) {
    Object.assign(this, partial);
  }
}
