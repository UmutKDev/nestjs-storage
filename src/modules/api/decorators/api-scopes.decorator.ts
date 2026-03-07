import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '@common/enums/authentication.enum';

export const API_SCOPES_KEY = 'api-scopes';
export const ApiScopes = (...Scopes: ApiKeyScope[]) =>
  SetMetadata(API_SCOPES_KEY, Scopes);
