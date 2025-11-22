import { MimeTypeGroups, Role, UUID } from '@common/enums';

export const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const passwordGenerator = (length: number): string => {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-_=+';

  const password = Array.from({ length })
    .fill(charset)
    .map((e: string) => {
      return e[Math.floor(Math.random() * e.length)];
    });

  return password.join('');
};

export const uuidGenerator = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const mbToBytes = (mb: number): number => {
  return mb * 1024 * 1024;
};

export const CDNPathResolver = (path: string): string => {
  return path ? process.env.STORAGE_S3_PUBLIC_ENDPOINT + '/' + path : path;
};

export const isManager = (user: UserContext, cursor: keyof UserContext) => {
  return user.role === Role.MANAGER
    ? user[cursor]
      ? user[cursor]
      : UUID.EMPTY
    : undefined;
};

export const isAdmin = (user: UserContext, cursor: keyof UserContext) => {
  return user.role !== Role.ADMIN
    ? user[cursor]
      ? user[cursor]
      : UUID.EMPTY
    : undefined;
};

export const IsImageFile = (name: string): boolean => {
  const imageExtensions = Object.values(MimeTypeGroups.Images).map(
    (type) => type.split('/')[1],
  );
  const lowerName = name.toLowerCase();
  return imageExtensions.some((ext) => lowerName.endsWith(ext));
};
