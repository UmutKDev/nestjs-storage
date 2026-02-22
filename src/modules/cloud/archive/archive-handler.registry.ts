import { Injectable } from '@nestjs/common';
import { ArchiveHandler } from './archive-handler.interface';
import { ArchiveFormat } from '@common/enums';
import { ZipArchiveHandler } from './handlers/zip.handler';
import { TarArchiveHandler } from './handlers/tar.handler';
import { RarArchiveHandler } from './handlers/rar.handler';

@Injectable()
export class ArchiveHandlerRegistry {
  private readonly Handlers = new Map<string, ArchiveHandler>();

  constructor() {
    this.RegisterHandler(new ZipArchiveHandler());
    this.RegisterHandler(new TarArchiveHandler(false));
    this.RegisterHandler(new TarArchiveHandler(true));
    this.RegisterHandler(new RarArchiveHandler());
  }

  private RegisterHandler(handler: ArchiveHandler): void {
    for (const ext of handler.Extensions) {
      this.Handlers.set(ext.toLowerCase(), handler);
    }
    this.Handlers.set(handler.Format, handler);
  }

  GetHandlerByExtension(extension: string): ArchiveHandler | null {
    return this.Handlers.get(extension.toLowerCase()) ?? null;
  }

  GetHandlerByFormat(format: ArchiveFormat): ArchiveHandler | null {
    return this.Handlers.get(format) ?? null;
  }

  GetHandler(formatOrExtension: string): ArchiveHandler | null {
    return this.Handlers.get(formatOrExtension.toLowerCase()) ?? null;
  }

  GetSupportedExtensions(): string[] {
    const extensions: string[] = [];
    for (const [key, handler] of this.Handlers) {
      if (handler.Extensions.includes(key)) {
        extensions.push(key);
      }
    }
    return extensions;
  }
}
