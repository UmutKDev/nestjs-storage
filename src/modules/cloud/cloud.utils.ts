export const NormalizeDirectoryPath = (path: string): string =>
  (path || '').replace(/^\/+|\/+$/g, '');

export const EnsureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : value + '/';

export const IsZipKey = (key: string): boolean => /\.zip$/i.test(key || '');

export const JoinKey = (...parts: string[]): string =>
  parts
    .map((part) => (part || '').replace(/^\/+|\/+$/g, ''))
    .filter((part) => !!part)
    .join('/');

export const BuildZipExtractPrefix = (key: string): string => {
  const normalized = NormalizeDirectoryPath(key);
  const parts = normalized.split('/').filter((part) => !!part);
  const filename = parts.pop() || '';
  const baseName = filename.replace(/\.zip$/i, '').trim();
  const safeBase = baseName || filename || 'extracted';
  const parent = parts.join('/');
  return JoinKey(parent, safeBase);
};

export const NormalizeZipEntryPath = (entryPath: string): string | null => {
  const normalized = (entryPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const segments = normalized.split('/').filter((segment) => !!segment);
  if (!segments.length) {
    return null;
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  return segments.join('/');
};
