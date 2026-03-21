import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiTags,
  ApiHeader,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';
import { TEAM_ID_HEADER } from '@modules/team/guards/team-context.guard';
import { DocumentService } from './document.service';
import {
  DocumentCreateRequestModel,
  DocumentContentRequestModel,
  DocumentUpdateContentRequestModel,
  DocumentKeyRequestModel,
  DocumentDraftRequestModel,
  DocumentDiffRequestModel,
  DocumentRestoreVersionRequestModel,
  DocumentDeleteVersionRequestModel,
  DocumentResponseModel,
  DocumentContentResponseModel,
  DocumentLockResponseModel,
  DocumentDraftResponseModel,
  DocumentDiffResponseModel,
} from './document.model';

@Controller('Cloud/Documents')
@ApiTags('Cloud / Documents')
@ApiCookieAuth()
@ApiHeader({
  name: TEAM_ID_HEADER,
  required: false,
  description:
    'Optional team ID. When provided, document operations target the team storage.',
})
@CheckPolicies((Ability) => Ability.can(CaslAction.Read, CaslSubject.Document))
export class DocumentController {
  constructor(private readonly DocumentService: DocumentService) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  @Post()
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Create, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Create a new text document',
    description:
      'Creates a new text document with optional initial content. Supported extensions: txt, md, js, ts, py, css, html, json, xml, yaml, yml, env, sql, sh, bash, csv, log, ini, cfg, conf.',
  })
  @ApiSuccessResponse(DocumentResponseModel)
  @ApiResponse({
    status: 400,
    description: 'Invalid extension or content too large',
  })
  @ApiResponse({
    status: 409,
    description: 'File already exists at the specified path',
  })
  async Create(
    @Body() model: DocumentCreateRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentResponseModel> {
    return this.DocumentService.Create(model, user);
  }

  @Get('Content')
  @ApiOperation({
    summary: 'Read document content',
    description:
      'Returns the text content of a document. If IncludeDraft=true and a draft exists, returns the draft content instead.',
  })
  @ApiSuccessResponse(DocumentContentResponseModel)
  @ApiResponse({ status: 404, description: 'Document not found' })
  async ReadContent(
    @Query() model: DocumentContentRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentContentResponseModel> {
    return this.DocumentService.ReadContent(model, user);
  }

  @Put('Content')
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Update document content',
    description:
      'Saves new content to the document. If ExpectedContentHash is provided and does not match the current hash, returns 409 Conflict. Creates a new S3 version automatically.',
  })
  @ApiSuccessResponse(DocumentContentResponseModel)
  @ApiResponse({ status: 400, description: 'Content too large or invalid' })
  @ApiResponse({
    status: 409,
    description: 'Content hash mismatch (concurrent edit detected)',
  })
  @ApiResponse({
    status: 423,
    description: 'Document is locked by another user',
  })
  @ApiResponse({
    status: 429,
    description: 'Save throttled (too frequent saves)',
  })
  async UpdateContent(
    @Body() model: DocumentUpdateContentRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentContentResponseModel> {
    return this.DocumentService.UpdateContent(model, user);
  }

  @Get('Find')
  @ApiOperation({
    summary: 'Find document metadata',
    description: 'Returns metadata for a document by its S3 key.',
  })
  @ApiSuccessResponse(DocumentResponseModel)
  @ApiResponse({ status: 404, description: 'Document not found' })
  async Find(
    @Query() model: DocumentKeyRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentResponseModel> {
    return this.DocumentService.Find(model, user);
  }

  // =========================================================================
  // LOCKING
  // =========================================================================

  @Post('Lock')
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Acquire edit lock on a document',
    description:
      'Acquires a pessimistic edit lock (5-minute TTL). If already locked by the same user, extends the lock. If locked by another user, returns 423.',
  })
  @ApiSuccessResponse(DocumentLockResponseModel)
  @ApiResponse({
    status: 423,
    description: 'Document is locked by another user',
  })
  async AcquireLock(
    @Body() model: DocumentKeyRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentLockResponseModel> {
    return this.DocumentService.AcquireLock(model, user);
  }

  @Delete('Lock')
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Release edit lock on a document',
    description: 'Releases the edit lock. Only the lock owner can release it.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lock released',
    schema: { type: 'boolean' },
  })
  @ApiResponse({ status: 403, description: 'You do not own this lock' })
  async ReleaseLock(
    @Body() model: DocumentKeyRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.DocumentService.ReleaseLock(model, user);
  }

  @Put('Lock/Heartbeat')
  @ApiOperation({
    summary: 'Extend lock TTL (heartbeat)',
    description:
      'Extends the lock TTL by another 5 minutes. Client should call this every ~3 minutes to keep the lock alive.',
  })
  @ApiSuccessResponse(DocumentLockResponseModel)
  @ApiResponse({ status: 403, description: 'You do not own this lock' })
  @ApiResponse({ status: 404, description: 'No active lock found' })
  async ExtendLock(
    @Body() model: DocumentKeyRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentLockResponseModel> {
    return this.DocumentService.ExtendLock(model, user);
  }

  // =========================================================================
  // DRAFTS
  // =========================================================================

  @Post('Draft')
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Save draft (auto-save)',
    description:
      'Saves a draft version of the document to Redis. Throttled to 1 save per 10 seconds. Every 5th save is also persisted to S3 for durability.',
  })
  @ApiSuccessResponse(DocumentDraftResponseModel)
  @ApiResponse({
    status: 423,
    description: 'Document is locked by another user',
  })
  @ApiResponse({ status: 429, description: 'Auto-save throttled' })
  async SaveDraft(
    @Body() model: DocumentDraftRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentDraftResponseModel> {
    return this.DocumentService.SaveDraft(model, user);
  }

  @Delete('Draft')
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Discard draft',
    description: 'Deletes the draft from both Redis and S3 backup.',
  })
  @ApiResponse({
    status: 200,
    description: 'Draft discarded',
    schema: { type: 'boolean' },
  })
  async DiscardDraft(
    @Body() model: DocumentKeyRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.DocumentService.DiscardDraft(model, user);
  }

  // =========================================================================
  // VERSIONING
  // =========================================================================

  @Get('Versions')
  @ApiOperation({
    summary: 'List document versions',
    description: 'Returns the version history for the document.',
  })
  async ListVersions(
    @Query() model: DocumentKeyRequestModel,
    @User() user: UserContext,
  ) {
    return this.DocumentService.ListVersions(model, user);
  }

  @Get('Versions/Diff')
  @ApiOperation({
    summary: 'Diff between two versions',
    description:
      'Computes a line-by-line diff between two document versions. Use "current" as a version ID to reference the latest content.',
  })
  @ApiSuccessResponse(DocumentDiffResponseModel)
  async DiffVersions(
    @Query() model: DocumentDiffRequestModel,
    @User() user: UserContext,
  ): Promise<DocumentDiffResponseModel> {
    return this.DocumentService.DiffVersions(model, user);
  }

  @Put('Versions/Restore')
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Restore a previous version',
    description:
      'Copies the specified version as the new current version. Updates document metadata.',
  })
  async RestoreVersion(
    @Body() model: DocumentRestoreVersionRequestModel,
    @User() user: UserContext,
  ): Promise<void> {
    return this.DocumentService.RestoreVersion(model, user);
  }

  @Delete('Versions')
  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.Document),
  )
  @ApiOperation({
    summary: 'Delete a specific version',
    description: 'Permanently deletes a non-current version of the document.',
  })
  async DeleteVersion(
    @Body() model: DocumentDeleteVersionRequestModel,
    @User() user: UserContext,
  ): Promise<void> {
    return this.DocumentService.DeleteVersion(model, user);
  }
}
