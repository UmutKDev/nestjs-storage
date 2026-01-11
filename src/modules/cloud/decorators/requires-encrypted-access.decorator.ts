import { SetMetadata } from '@nestjs/common';
import { ENCRYPTED_FOLDER_METADATA } from '../cloud.constants';

/**
 * Decorator to mark endpoints that may access encrypted folder contents.
 * When applied, the EncryptedFolderGuard will validate the session token.
 */
export const RequiresEncryptedAccess = () =>
  SetMetadata(ENCRYPTED_FOLDER_METADATA, true);
