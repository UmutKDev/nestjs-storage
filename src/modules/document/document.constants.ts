import { DocumentLanguage, DocumentType } from '@common/enums';

/** Maximum document content size in bytes (10 MB) */
export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Persist draft to S3 every N auto-saves */
export const DOCUMENT_DRAFT_S3_PERSIST_INTERVAL = 5;

export interface DocumentExtensionConfig {
  MimeType: string;
  Type: DocumentType;
  Language: DocumentLanguage;
}

export const ALLOWED_DOCUMENT_EXTENSIONS: Record<
  string,
  DocumentExtensionConfig
> = {
  txt: {
    MimeType: 'text/plain',
    Type: DocumentType.PLAIN_TEXT,
    Language: DocumentLanguage.PLAIN,
  },
  md: {
    MimeType: 'text/markdown',
    Type: DocumentType.MARKDOWN,
    Language: DocumentLanguage.MARKDOWN,
  },
  js: {
    MimeType: 'application/javascript',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.JAVASCRIPT,
  },
  ts: {
    MimeType: 'application/typescript',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.TYPESCRIPT,
  },
  py: {
    MimeType: 'text/x-python',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.PYTHON,
  },
  css: {
    MimeType: 'text/css',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.CSS,
  },
  html: {
    MimeType: 'text/html',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.HTML,
  },
  json: {
    MimeType: 'application/json',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.JSON,
  },
  xml: {
    MimeType: 'application/xml',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.XML,
  },
  yaml: {
    MimeType: 'text/yaml',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.YAML,
  },
  yml: {
    MimeType: 'text/yaml',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.YAML,
  },
  env: {
    MimeType: 'text/plain',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.ENV,
  },
  sql: {
    MimeType: 'application/sql',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.SQL,
  },
  sh: {
    MimeType: 'application/x-sh',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.SHELL,
  },
  bash: {
    MimeType: 'application/x-sh',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.SHELL,
  },
  csv: {
    MimeType: 'text/csv',
    Type: DocumentType.PLAIN_TEXT,
    Language: DocumentLanguage.PLAIN,
  },
  log: {
    MimeType: 'text/plain',
    Type: DocumentType.PLAIN_TEXT,
    Language: DocumentLanguage.PLAIN,
  },
  ini: {
    MimeType: 'text/plain',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.PLAIN,
  },
  cfg: {
    MimeType: 'text/plain',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.PLAIN,
  },
  conf: {
    MimeType: 'text/plain',
    Type: DocumentType.CODE,
    Language: DocumentLanguage.PLAIN,
  },
};
