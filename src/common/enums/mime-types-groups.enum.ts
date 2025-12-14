export namespace MimeTypeGroups {
  export enum Images {
    Jpeg = 'image/jpeg',
    Jpg = 'image/jpg',
    Png = 'image/png',
    Gif = 'image/gif',
    Bmp = 'image/bmp',
    Webp = 'image/webp',
    Tiff = 'image/tiff',
  }

  export enum Audio {
    Mpeg = 'audio/mpeg',
    Wav = 'audio/wav',
    Ogg = 'audio/ogg',
    Aac = 'audio/aac',
    Webm = 'audio/webm',
    Flac = 'audio/flac',
    Wma = 'audio/x-ms-wma',
  }

  export enum Video {
    Mp4 = 'video/mp4',
    Webm = 'video/webm',
    Ogg = 'video/ogg',
    Quicktime = 'video/quicktime',
    Wmv = 'video/x-ms-wmv',
    Flv = 'video/x-flv',
  }

  export enum Documents {
    Pdf = 'application/pdf',
    MsWord = 'application/msword',
    WordOpenXml = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    MsExcel = 'application/vnd.ms-excel',
    ExcelOpenXml = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    MsPowerPoint = 'application/vnd.ms-powerpoint',
    PowerPointOpenXml = 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }

  export enum Archives {
    Zip = 'application/zip',
    Rar = 'application/x-rar-compressed',
    SevenZ = 'application/x-7z-compressed',
    Tar = 'application/x-tar',
    Gzip = 'application/gzip',
  }
}

export namespace MimeTypesExtensions {
  export const Images = [
    '.jpeg',
    '.jpg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.tiff',
  ];

  export const Audio = [
    '.mp3',
    '.wav',
    '.ogg',
    '.aac',
    '.webm',
    '.flac',
    '.wma',
  ];

  export const Video = ['.mp4', '.webm', '.ogg', '.mov', '.wmv', '.flv'];

  export const Documents = [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
  ];
  export const Archives = ['.zip', '.rar', '.7z', '.tar', '.gz'];
}

export const AllMimeTypesExtensions = [
  ...MimeTypesExtensions.Images,
  ...MimeTypesExtensions.Audio,
  ...MimeTypesExtensions.Video,
  ...MimeTypesExtensions.Documents,
  ...MimeTypesExtensions.Archives,
];

export const AllMimeTypes = [
  ...Object.values(MimeTypeGroups.Images),
  ...Object.values(MimeTypeGroups.Audio),
  ...Object.values(MimeTypeGroups.Video),
  ...Object.values(MimeTypeGroups.Documents),
  ...Object.values(MimeTypeGroups.Archives),
];
