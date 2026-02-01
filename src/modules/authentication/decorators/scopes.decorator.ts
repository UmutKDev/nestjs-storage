import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '@common/enums/authentication.enum';
import { SCOPES_KEY } from '../guards/api-key.guard';

export const Scopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
