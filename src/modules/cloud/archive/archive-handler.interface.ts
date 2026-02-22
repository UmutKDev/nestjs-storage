import { Readable, PassThrough } from 'stream';
import { ArchiveFormat, ArchiveEntryType, ArchivePhase } from '@common/enums';

// ─── Shared Types ────────────────────────────────────────────────────────────

export type ArchiveEntry = {
  Path: string;
  Type: ArchiveEntryType;
  Size: number;
  CompressedSize?: number;
  LastModified?: Date;
};

export type ArchiveExtractProgress = {
  Phase: ArchivePhase.EXTRACT;
  EntriesProcessed: number;
  TotalEntries: number | null;
  BytesRead: number;
  TotalBytes: number;
  CurrentEntry?: string;
};

export type ArchiveCreateProgress = {
  Phase: ArchivePhase.CREATE;
  EntriesProcessed: number;
  TotalEntries: number;
  BytesWritten: number;
  CurrentEntry?: string;
};

export type ArchiveExtractOptions = {
  OnProgress?: (progress: ArchiveExtractProgress) => Promise<void> | void;
  ShouldCancel?: () => Promise<boolean> | boolean;
  SelectedEntries?: Set<string>;
};

export type ArchiveCreateOptions = {
  OnProgress?: (progress: ArchiveCreateProgress) => Promise<void> | void;
  ShouldCancel?: () => Promise<boolean> | boolean;
};

export type ArchiveSafetyLimits = {
  MaxEntries: number;
  MaxEntryBytes: number;
  MaxTotalBytes: number;
  MaxCompressionRatio: number;
};

export type ArchiveExtractResult = {
  TotalUncompressedBytes: number;
  EntriesProcessed: number;
};

export type ArchiveEntryCallback = (entry: {
  Path: string;
  Type: ArchiveEntryType;
  Size: number;
  Stream: Readable;
}) => Promise<void>;

export type ArchiveCreateEntry = {
  Key: string;
  Name: string;
  Size: number;
};

export type ArchiveCreateGetStream = (key: string) => Promise<Readable>;

// ─── Handler Interface ───────────────────────────────────────────────────────

export interface ArchiveHandler {
  readonly Format: ArchiveFormat;
  readonly Extensions: string[];
  readonly SupportsCreation: boolean;

  ListEntries(
    stream: Readable,
    totalBytes: number,
    limits: ArchiveSafetyLimits,
  ): Promise<ArchiveEntry[]>;

  Extract(
    stream: Readable,
    totalBytes: number,
    limits: ArchiveSafetyLimits,
    onEntry: ArchiveEntryCallback,
    options?: ArchiveExtractOptions,
  ): Promise<ArchiveExtractResult>;

  Create?(
    entries: ArchiveCreateEntry[],
    getStream: ArchiveCreateGetStream,
    output: PassThrough,
    options?: ArchiveCreateOptions,
  ): Promise<void>;
}
