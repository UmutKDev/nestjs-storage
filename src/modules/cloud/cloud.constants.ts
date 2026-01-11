export const ENCRYPTED_FOLDER_METADATA = 'encrypted_folder_access';

/**
 * Session TTL for encrypted folder access (in seconds)
 * After unlocking, the session is valid for this duration
 */
export const ENCRYPTED_FOLDER_SESSION_TTL = 15 * 60; // 15 minutes

/**
 * Header name for folder session token
 */
export const FOLDER_SESSION_HEADER = 'x-folder-session';

/**
 * Header name for folder passphrase (used during unlock)
 */
export const FOLDER_PASSPHRASE_HEADER = 'x-folder-passphrase';
