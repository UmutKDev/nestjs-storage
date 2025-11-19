import { UploadSessionStatus } from '@common/enums';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'CloudUploadSession' })
@Index(['uploadId'], { unique: true })
@Index(['userId'])
export class UploadSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 1000, unique: true })
  uploadId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 512 })
  s3Key: string;

  @Column({ type: 'varchar', length: 256 })
  fileName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'bigint' })
  totalSize: number;

  @Column({ type: 'int', default: 5242880 }) // 5MB default
  chunkSize: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, string>;

  @Column({ type: 'json', default: '[]' })
  uploadedParts: { partNumber: number; etag: string; size: number }[];

  @Column({
    type: 'enum',
    enum: UploadSessionStatus,
    default: UploadSessionStatus.ACTIVE,
  })
  status: UploadSessionStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
