import { MimeTypeGroups, Role, UUID } from '@common/enums';
import { camelCase, startCase } from 'lodash';

export const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const turkishSlugify = (value: string): string => {
  if (!value) return '';
  return value
    .normalize('NFC')
    .replace(/\u011e/g, 'G') // Ğ
    .replace(/\u00dc/g, 'U') // Ü
    .replace(/\u015e/g, 'S') // Ş
    .replace(/\u0130/g, 'I') // İ
    .replace(/\u00d6/g, 'O') // Ö
    .replace(/\u00c7/g, 'C') // Ç
    .replace(/\u011f/g, 'g') // ğ
    .replace(/\u00fc/g, 'u') // ü
    .replace(/\u015f/g, 's') // ş
    .replace(/\u0131/g, 'i') // ı
    .replace(/\u00f6/g, 'o') // ö
    .replace(/\u00e7/g, 'c'); // ç
};

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
  return user.role === Role.USER
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

export const KeyCombiner = (keys: string[]): string => {
  return keys.filter((key) => key && key.length > 0).join('/');
};

export const ByteToMB = (bytes: number): number => {
  return bytes / (1024 * 1024);
};

export const KbyteToMB = (kilobytes: number): number => {
  return kilobytes / 1024;
};

export const ByteToKbyte = (bytes: number): number => {
  return bytes / 1024;
};

export const PascalizeKeys = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map((v) => PascalizeKeys(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [ToPascalCase(key)]: PascalizeKeys(obj[key]),
      }),
      {},
    );
  }
  return obj;
};

export const ToPascalCase = (str) =>
  startCase(camelCase(str)).replace(/ /g, '');
