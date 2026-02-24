/**
 * Returns the storage owner ID to use as the S3 key prefix.
 * - In personal context: User.Id
 * - In team context: 'team/' + User.TeamId
 */
export function GetStorageOwnerId(User: UserContext): string {
  if (User.TeamId) {
    return `team/${User.TeamId}`;
  }
  return User.Id;
}

/**
 * Returns the owner context identifier for Redis cache keys.
 * - In personal context: userId
 * - In team context: 'team:{teamId}'
 */
export function GetCacheOwnerId(User: UserContext): string {
  if (User.TeamId) {
    return `team:${User.TeamId}`;
  }
  return User.Id;
}
