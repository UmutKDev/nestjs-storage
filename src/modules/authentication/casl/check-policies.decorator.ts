import { SetMetadata } from '@nestjs/common';
import { PolicyHandler } from './casl.types';

export const CHECK_POLICIES_KEY = 'CheckPolicies';
export const CheckPolicies = (...Handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, Handlers);
