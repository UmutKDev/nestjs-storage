export const ENCRYPTED_FOLDER_METADATA = 'encrypted_folder_access';

/**
 * Header name for folder session token
 */
export const FOLDER_SESSION_HEADER = 'x-folder-session';

/**
 * Header name for folder passphrase (used during unlock)
 */
export const FOLDER_PASSPHRASE_HEADER = 'x-folder-passphrase';

export const CLOUD_UPLOAD_THROTTLE = {
  default: {
    ttl: Number(process.env.CLOUD_UPLOAD_RATE_TTL ?? 60000),
    limit: Number(process.env.CLOUD_UPLOAD_RATE_LIMIT ?? 60),
  },
};

export const CLOUD_DOWNLOAD_THROTTLE = {
  default: {
    ttl: Number(process.env.CLOUD_DOWNLOAD_RATE_TTL ?? 60000),
    limit: Number(process.env.CLOUD_DOWNLOAD_RATE_LIMIT ?? 60),
  },
};
