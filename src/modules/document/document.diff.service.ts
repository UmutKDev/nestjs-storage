import { Injectable, Logger } from '@nestjs/common';
import { structuredPatch } from 'diff';
import { DocumentContentService } from './document.content.service';

export interface DiffResult {
  Hunks: {
    OldStart: number;
    OldLines: number;
    NewStart: number;
    NewLines: number;
    Lines: string[];
  }[];
  Stats: {
    Additions: number;
    Deletions: number;
    Changes: number;
  };
}

@Injectable()
export class DocumentDiffService {
  private readonly Logger = new Logger(DocumentDiffService.name);

  constructor(
    private readonly DocumentContentService: DocumentContentService,
  ) {}

  /**
   * Compute diff between two document versions.
   * Use "current" as versionId to reference the latest content.
   */
  async DiffVersions(
    ownerId: string,
    key: string,
    sourceVersionId: string,
    targetVersionId: string,
  ): Promise<DiffResult> {
    const [sourceContent, targetContent] = await Promise.all([
      sourceVersionId === 'current'
        ? this.DocumentContentService.ReadContent(ownerId, key)
        : this.DocumentContentService.ReadVersionContent(
            ownerId,
            key,
            sourceVersionId,
          ),
      targetVersionId === 'current'
        ? this.DocumentContentService.ReadContent(ownerId, key)
        : this.DocumentContentService.ReadVersionContent(
            ownerId,
            key,
            targetVersionId,
          ),
    ]);

    return this.ComputeDiff(sourceContent, targetContent);
  }

  /**
   * Compute a structured diff between two strings.
   */
  ComputeDiff(sourceContent: string, targetContent: string): DiffResult {
    const patch = structuredPatch(
      'source',
      'target',
      sourceContent,
      targetContent,
    );

    const hunks = patch.hunks.map((h) => ({
      OldStart: h.oldStart,
      OldLines: h.oldLines,
      NewStart: h.newStart,
      NewLines: h.newLines,
      Lines: h.lines,
    }));

    let additions = 0;
    let deletions = 0;
    for (const hunk of patch.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith('+')) additions++;
        else if (line.startsWith('-')) deletions++;
      }
    }

    return {
      Hunks: hunks,
      Stats: {
        Additions: additions,
        Deletions: deletions,
        Changes: patch.hunks.length,
      },
    };
  }
}
