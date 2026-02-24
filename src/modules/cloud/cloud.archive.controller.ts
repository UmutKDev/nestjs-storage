import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiTags,
  ApiHeader,
  ApiOperation,
} from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import {
  CloudArchiveExtractStartRequestModel,
  CloudArchiveExtractStartResponseModel,
  CloudArchiveExtractStatusRequestModel,
  CloudArchiveExtractStatusResponseModel,
  CloudArchiveExtractCancelRequestModel,
  CloudArchiveExtractCancelResponseModel,
  CloudArchivePreviewRequestModel,
  CloudArchivePreviewResponseModel,
  CloudArchiveCreateStartRequestModel,
  CloudArchiveCreateStartResponseModel,
  CloudArchiveCreateStatusRequestModel,
  CloudArchiveCreateStatusResponseModel,
  CloudArchiveCreateCancelRequestModel,
  CloudArchiveCreateCancelResponseModel,
} from './cloud.model';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import { FOLDER_SESSION_HEADER } from './cloud.constants';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';

@Controller('Cloud/Archive')
@ApiTags('Cloud / Archive')
@ApiCookieAuth()
@CheckPolicies((Ability) =>
  Ability.can(CaslAction.Read, CaslSubject.CloudArchive),
)
export class CloudArchiveController {
  constructor(private readonly cloudService: CloudService) {}

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Extract, CaslSubject.CloudArchive),
  )
  @ApiOperation({
    summary: 'Start archive extraction',
    description:
      'Starts an async job to extract a .zip, .tar, .tar.gz, or .rar archive. Optionally provide SelectedEntries for selective extraction.',
  })
  @Post('Extract/Start')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudArchiveExtractStartResponseModel)
  async ArchiveExtractStart(
    @Body() model: CloudArchiveExtractStartRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudArchiveExtractStartResponseModel> {
    return this.cloudService.ArchiveExtractStart(model, user, sessionToken);
  }

  @ApiOperation({
    summary: 'Get archive extraction status',
    description:
      'Returns the current status/progress of an archive extraction job.',
  })
  @Get('Extract/Status')
  @ApiSuccessResponse(CloudArchiveExtractStatusResponseModel)
  async ArchiveExtractStatus(
    @Query() model: CloudArchiveExtractStatusRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveExtractStatusResponseModel> {
    return this.cloudService.ArchiveExtractStatus(model, user);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Extract, CaslSubject.CloudArchive),
  )
  @ApiOperation({
    summary: 'Cancel archive extraction',
    description:
      'Cancels an archive extraction job if it is pending or running.',
  })
  @Post('Extract/Cancel')
  @ApiSuccessResponse(CloudArchiveExtractCancelResponseModel)
  async ArchiveExtractCancel(
    @Body() model: CloudArchiveExtractCancelRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveExtractCancelResponseModel> {
    return this.cloudService.ArchiveExtractCancel(model, user);
  }

  @ApiOperation({
    summary: 'Preview archive contents',
    description:
      'Lists entries of an archive file without extracting. Supports .zip, .tar, .tar.gz, and .rar.',
  })
  @Get('Preview')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudArchivePreviewResponseModel)
  async ArchivePreview(
    @Query() model: CloudArchivePreviewRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudArchivePreviewResponseModel> {
    return this.cloudService.ArchivePreview(model, user, sessionToken);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Archive, CaslSubject.CloudArchive),
  )
  @ApiOperation({
    summary: 'Start archive creation',
    description:
      'Creates a .zip, .tar, or .tar.gz archive from the given keys (files and/or directories). Returns a job ID to track progress.',
  })
  @Post('Create/Start')
  @ApiSuccessResponse(CloudArchiveCreateStartResponseModel)
  async ArchiveCreateStart(
    @Body() model: CloudArchiveCreateStartRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveCreateStartResponseModel> {
    return this.cloudService.ArchiveCreateStart(model, user);
  }

  @ApiOperation({
    summary: 'Get archive creation status',
    description:
      'Returns the current status/progress of an archive creation job.',
  })
  @Get('Create/Status')
  @ApiSuccessResponse(CloudArchiveCreateStatusResponseModel)
  async ArchiveCreateStatus(
    @Query() model: CloudArchiveCreateStatusRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveCreateStatusResponseModel> {
    return this.cloudService.ArchiveCreateStatus(model, user);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Archive, CaslSubject.CloudArchive),
  )
  @ApiOperation({
    summary: 'Cancel archive creation',
    description: 'Cancels an archive creation job if it is pending or running.',
  })
  @Post('Create/Cancel')
  @ApiSuccessResponse(CloudArchiveCreateCancelResponseModel)
  async ArchiveCreateCancel(
    @Body() model: CloudArchiveCreateCancelRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveCreateCancelResponseModel> {
    return this.cloudService.ArchiveCreateCancel(model, user);
  }
}
