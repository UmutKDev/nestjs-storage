export namespace MimeTypeGroups {
  export enum Images {
    Jpeg = 'image/jpeg',
    Png = 'image/png',
    Gif = 'image/gif',
    Bmp = 'image/bmp',
    Svg = 'image/svg+xml',
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
