import { SetMetadata } from '@nestjs/common';
import { ENCRYPTED_FOLDER_METADATA } from '../cloud.constants';

/**
 * Decorator to mark endpoints that may access encrypted folder contents.
 * Validation is handled in the service layer.
 */
export const RequiresEncryptedAccess = () =>
  SetMetadata(ENCRYPTED_FOLDER_METADATA, true);
