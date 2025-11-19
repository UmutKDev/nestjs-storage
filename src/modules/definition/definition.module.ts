import { Module } from '@nestjs/common';
import { DefinitionController } from './definition.controller';
import { DefinitionService } from './definition.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DefinitionEntity } from '@entities//definition.entity';
import { DefinitionGroupEntity } from '@entities//definition-group.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DefinitionEntity, DefinitionGroupEntity]),
  ],
  controllers: [DefinitionController],
  providers: [DefinitionService],
})
export class DefinitionModule {}
