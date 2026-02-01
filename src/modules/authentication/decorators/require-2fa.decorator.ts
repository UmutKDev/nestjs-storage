import { SetMetadata } from '@nestjs/common';
import { REQUIRE_2FA_KEY } from '../guards/two-factor.guard';

export const Require2FA = () => SetMetadata(REQUIRE_2FA_KEY, true);
