import { Module } from '@nestjs/common';
import { CloudModule } from '@modules/cloud/cloud.module';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentContentService } from './document.content.service';
import { DocumentLockService } from './document.lock.service';
import { DocumentDraftService } from './document.draft.service';
import { DocumentDiffService } from './document.diff.service';

@Module({
  imports: [CloudModule],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    DocumentContentService,
    DocumentLockService,
    DocumentDraftService,
    DocumentDiffService,
  ],
  exports: [DocumentService],
})
export class DocumentModule {}
