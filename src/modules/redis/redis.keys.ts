// ─── Session Keys ────────────────────────────────────────────────────────────

export namespace SessionKeys {
  /** session:{sessionId} — stores SessionData */
  export const Session = (sessionId: string) => `session:${sessionId}`;

  /** session:user:{userId}:{sessionId} — maps user→session */
  export const UserSession = (userId: string, sessionId: string) =>
    `session:user:${userId}:${sessionId}`;

  /** session:user:{userId}:* — pattern to find all sessions of a user */
  export const UserSessionsPattern = (userId: string) =>
    `session:user:${userId}:*`;
}

// ─── API-Key Keys ────────────────────────────────────────────────────────────

export namespace ApiKeyKeys {
  /** api-key:rate-limit:{apiKeyId} — per-minute request counter */
  export const RateLimit = (apiKeyId: string) =>
    `api-key:rate-limit:${apiKeyId}`;

  /** api-key:entity:{publicKey} — cached API key entity */
  export const Entity = (publicKey: string) => `api-key:entity:${publicKey}`;

  /** api-key:entity:* — pattern to invalidate all cached API key entities */
  export const EntityPattern = `api-key:entity:*`;
}

// ─── Authentication Keys ─────────────────────────────────────────────────────

export namespace AuthKeys {
  /** auth:2fa-enabled:{userId} — cached boolean for isTwoFactorEnabled */
  export const TwoFactorEnabled = (userId: string) =>
    `auth:2fa-enabled:${userId}`;

  /** auth:has-passkey:{userId} — cached boolean for hasPasskey */
  export const HasPasskey = (userId: string) => `auth:has-passkey:${userId}`;
}

// ─── Subscription Keys ──────────────────────────────────────────────────────

export namespace SubscriptionKeys {
  /** subscription:list — cached list of all subscription plans */
  export const List = `subscription:list`;

  /** subscription:user:{userId} — cached user subscription */
  export const UserSubscription = (userId: string) =>
    `subscription:user:${userId}`;
}

// ─── Definition Keys ─────────────────────────────────────────────────────────

export namespace DefinitionKeys {
  /** definition:group:{skip}:{take}[:{search}] — cached definition groups */
  export const Group = (skip: number, take: number, search?: string) =>
    `definition:group:${skip}:${take}${search ? ':' + encodeURIComponent(search) : ''}`;

  /** definition:list:{groupCode}:{skip}:{take}[:{search}] — cached definitions */
  export const ListDefinition = (
    groupCode: string,
    skip: number,
    take: number,
    search?: string,
  ) =>
    `definition:list:${groupCode}:${skip}:${take}${search ? ':' + encodeURIComponent(search) : ''}`;

  /** definition:* — pattern to invalidate all definition caches */
  export const AllPattern = `definition:*`;
}

// ─── Account Keys ────────────────────────────────────────────────────────────

export namespace AccountKeys {
  /** account:profile:{userId} — cached user profile */
  export const Profile = (userId: string) => `account:profile:${userId}`;
}

// ─── Cloud Keys ──────────────────────────────────────────────────────────────

export namespace CloudKeys {
  /** cloud:list:{userId}:{path}:full:{delim|nodelim}:{meta|nometa}:{auth|noauth} — combined list response */
  export const List = (
    userId: string,
    path: string,
    delimiter: boolean,
    metadata: boolean,
    hasSession: boolean,
    hasHiddenSession: boolean,
  ) =>
    `cloud:list:${userId}:${path || 'root'}:full:${delimiter ? 'delim' : 'nodelim'}:${metadata ? 'meta' : 'nometa'}:${hasSession ? 'auth' : 'noauth'}:${hasHiddenSession ? 'hauth' : 'nohauth'}`;

  /** cloud:list:{userId}:{path}:objects:{delim|nodelim}:{meta|nometa}:{skip}:{take}[:{search}] */
  export const ListObjects = (
    userId: string,
    path: string,
    delimiter: boolean,
    metadata: boolean,
    skip: number,
    take: number,
    search?: string,
  ) =>
    `cloud:list:${userId}:${path || 'root'}:objects:${delimiter ? 'delim' : 'nodelim'}:${metadata ? 'meta' : 'nometa'}:${skip}:${take}${search ? ':' + encodeURIComponent(search) : ''}`;

  /** cloud:list:{userId}:{path}:dirs:{skip}:{take}:{auth|noauth}:{hauth|nohauth}[:{search}] */
  export const ListDirectories = (
    userId: string,
    path: string,
    skip: number,
    take: number,
    hasSession: boolean,
    hasHiddenSession: boolean,
    search?: string,
  ) =>
    `cloud:list:${userId}:${path || 'root'}:dirs:${skip}:${take}:${hasSession ? 'auth' : 'noauth'}:${hasHiddenSession ? 'hauth' : 'nohauth'}${search ? ':' + encodeURIComponent(search) : ''}`;

  /** cloud:list:{userId}:* — invalidate all listing caches for a user */
  export const ListAllPattern = (userId: string) => `cloud:list:${userId}:*`;

  /** cloud:dir-thumbnails:{signed|public}:{userId}:{directoryPrefix} */
  export const DirectoryThumbnails = (
    userId: string,
    directoryPrefix: string,
    isSigned: boolean,
  ) =>
    `cloud:dir-thumbnails:${isSigned ? 'signed' : 'public'}:${userId}:${directoryPrefix}`;

  /** cloud:scan:{userId}:{encodedKey} — AV scan status for a file */
  export const ScanStatus = (userId: string, key: string) => {
    const encodedKey = encodeURIComponent(key || '');
    return `cloud:scan:${userId}:${encodedKey}`;
  };

  /** @deprecated Use ArchiveExtractCancel instead */
  export const ZipExtractCancel = (jobId: string) =>
    `cloud:zip-extract:cancel:${jobId}`;

  /** cloud:archive-extract:cancel:{jobId} — signal to cancel a running archive extraction */
  export const ArchiveExtractCancel = (jobId: string) =>
    `cloud:archive-extract:cancel:${jobId}`;

  /** cloud:archive-create:cancel:{jobId} — signal to cancel archive creation */
  export const ArchiveCreateCancel = (jobId: string) =>
    `cloud:archive-create:cancel:${jobId}`;

  /** cloud:archive-create:result:{jobId} — cached creation result */
  export const ArchiveCreateResult = (jobId: string) =>
    `cloud:archive-create:result:${jobId}`;

  /** cloud:idempotency:{userId}:{action}:{idempotencyKey} — dedup cache for mutations */
  export const Idempotency = (
    userId: string,
    action: string,
    idempotencyKey: string,
  ) => `cloud:idempotency:${userId}:${action}:${idempotencyKey}`;

  /** cloud:user:{userId}:{operation}[:params] — generic per-user cloud cache */
  export const UserCache = (
    userId: string,
    operation: string,
    params?: Record<string, unknown>,
  ) => {
    const baseKey = `cloud:user:${userId}:${operation}`;
    if (params) {
      const paramString = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(':');
      return paramString ? `${baseKey}:${paramString}` : baseKey;
    }
    return baseKey;
  };

  /** cloud:user:{userId}:* — pattern to invalidate all cloud caches for a user */
  export const UserCachePattern = (userId: string) => `cloud:user:${userId}:*`;

  /** cloud:encrypted-manifest:{userId} — cached encrypted folder manifest */
  export const EncryptedFolderManifest = (userId: string) =>
    `cloud:encrypted-manifest:${userId}`;

  /** cloud:encrypted-folder:session:{userId}:{normalizedPath} — unlock session */
  export const EncryptedFolderSession = (
    userId: string,
    normalizedPath: string,
  ) => `cloud:encrypted-folder:session:${userId}:${normalizedPath}`;

  /** Glob pattern that matches the encrypted-folder session key + any child paths */
  export const EncryptedFolderSessionPattern = (
    userId: string,
    normalizedPath: string,
  ) => `${EncryptedFolderSession(userId, normalizedPath)}*`;

  /** cloud:hidden-manifest:{userId} — cached hidden folder manifest */
  export const HiddenFolderManifest = (userId: string) =>
    `cloud:hidden-manifest:${userId}`;

  /** cloud:hidden-folder:session:{userId}:{normalizedPath} — reveal session */
  export const HiddenFolderSession = (userId: string, normalizedPath: string) =>
    `cloud:hidden-folder:session:${userId}:${normalizedPath}`;

  /** Glob pattern that matches the hidden-folder session key + any child paths */
  export const HiddenFolderSessionPattern = (
    userId: string,
    normalizedPath: string,
  ) => `${HiddenFolderSession(userId, normalizedPath)}*`;
}

// ─── Team Keys ──────────────────────────────────────────────────────────────

export namespace TeamKeys {
  /** team:member:{teamId}:{userId} — cached membership for fast guard checks */
  export const Membership = (teamId: string, userId: string) =>
    `team:member:${teamId}:${userId}`;

  /** team:member:{teamId}:* — pattern to invalidate all membership caches for a team */
  export const MembershipPattern = (teamId: string) =>
    `team:member:${teamId}:*`;

  /** team:list:{userId} — cached list of teams for a user */
  export const UserTeams = (userId: string) => `team:list:${userId}`;

  /** team:detail:{teamId} — cached team details */
  export const Detail = (teamId: string) => `team:detail:${teamId}`;

  /** team:invitations:{teamId} — cached pending invitations for a team */
  export const Invitations = (teamId: string) =>
    `team:invitations:${teamId}`;

  /** team:user-invitations:{email} — cached pending invitations for a user email */
  export const UserInvitations = (email: string) =>
    `team:user-invitations:${email}`;
}
