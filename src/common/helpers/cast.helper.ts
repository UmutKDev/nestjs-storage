import { AllMimeTypesExtensions, MimeTypeGroups } from '@common/enums';
import { camelCase, startCase } from 'lodash';
import { randomBytes, randomInt, randomUUID } from 'crypto';

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
      return e[randomInt(e.length)];
    });

  return password.join('');
};

export const uuidGenerator = (): string => {
  return randomUUID();
};

export const SizeFormatter = ({
  From,
  FromUnit,
  ToUnit,
}: {
  From: number;
  FromUnit: 'B' | 'KB' | 'MB' | 'GB';
  ToUnit: 'B' | 'KB' | 'MB' | 'GB';
}): number => {
  const unitMap = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const bytes = From * unitMap[FromUnit];
  return bytes / unitMap[ToUnit];
};

export const CDNPathResolver = (path: string): string => {
  return path ? process.env.S3_PUBLIC_ENDPOINT + '/' + path : path;
};

export const IsImageFile = (name: string): boolean => {
  const imageExtensions = Object.values(MimeTypeGroups.Images).map(
    (type) => type.split('/')[1],
  );
  const lowerName = name.toLowerCase();
  return imageExtensions.some((ext) => lowerName.endsWith(ext));
};

export const KeyBuilder = (keys: string[]): string => {
  // Normalize each segment by removing leading/trailing slashes so joining
  // always produces a single '/' between parts. Also ignore empty segments.
  const combined = keys
    .filter((key) => key && key.length > 0)
    .map((key) => key.replace(/^\/+|\/+$/g, ''))
    .filter((key) => key.length > 0)
    .join('/');

  // If there's nothing left, return empty string
  if (!combined) return '';

  // If the final segment contains a file extension (dot followed by chars),
  // keep it as-is. Otherwise ensure the combined path ends with a single '/'.
  const lastSegment = combined.split('/').pop() || '';
  const hasExtension = /\.[^/]+$/.test(lastSegment);

  return hasExtension ? combined : combined + '/';
};

export const PascalizeKeys = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map((v) => PascalizeKeys(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce<Record<string, any>>(
      (result, key) => ({
        ...result,
        [ToPascalCase(key)]: PascalizeKeys(obj[key]),
      }),
      {},
    );
  }
  return obj;
};

export const ToPascalCase = (str: string): string =>
  startCase(camelCase(str)).replace(/ /g, '');

export const S3KeyConverter = (input: string): string => {
  const trMap: Record<string, string> = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
    Ç: 'C',
    Ğ: 'G',
    İ: 'I',
    Ö: 'O',
    Ş: 'S',
    Ü: 'U',
  };

  return decodeURIComponent(input)
    .replace(/^https?:\/\/[^/]+\//, '') // domain'i at
    .replace(/[?#].*$/, '') // query ve fragment'i sil
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => trMap[c]) // Türkçe karakterleri dönüştür
    .trim();
};

export const ExtensionFromMimeType = (mimeType: string): string | null => {
  for (const ext of AllMimeTypesExtensions) {
    const base = ext.slice(1).toLowerCase();
    const key = base.charAt(0).toUpperCase() + base.slice(1);
    const type =
      MimeTypeGroups.Images[key] ||
      MimeTypeGroups.Audio[key] ||
      MimeTypeGroups.Video[key] ||
      MimeTypeGroups.Documents[key] ||
      MimeTypeGroups.Archives[key];
    if (type === mimeType) return ext;
  }
  return null;
};

export const MimeTypeFromExtension = (extension: string): string | null => {
  const ext = (
    extension.startsWith('.') ? extension : '.' + extension
  ).toLowerCase();
  const base = ext.slice(1).toLowerCase();
  const key = base.charAt(0).toUpperCase() + base.slice(1);
  const type =
    MimeTypeGroups.Images[key] ||
    MimeTypeGroups.Audio[key] ||
    MimeTypeGroups.Video[key] ||
    MimeTypeGroups.Documents[key] ||
    MimeTypeGroups.Archives[key];
  return type || null;
};
