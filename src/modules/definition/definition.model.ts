import { BaseDateModel } from '@common/models/base.model';
import { DefinitionGroupEntity } from '@entities//definition-group.entity';
import { DefinitionEntity } from '@entities//definition.entity';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class DefinitionViewModel implements DefinitionEntity {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id: string;

  @Expose()
  @ApiProperty()
  // @Transform(({ value }) => slugify(value))
  code: string;

  @Expose()
  @ApiProperty()
  value: string;

  @Expose()
  @ApiProperty()
  description: string;

  @Expose()
  @ApiProperty()
  image: string;

  @Expose()
  @ApiProperty()
  isDefault: boolean;

  @Expose()
  @ApiProperty()
  isSystem: boolean;

  @Expose()
  @ApiProperty({ type: () => DefinitionDefinitionGroupResponseModel })
  @Type(() => DefinitionDefinitionGroupResponseModel)
  definitionGroup: DefinitionGroupEntity;

  @Expose()
  @ApiProperty({ type: BaseDateModel })
  date: BaseDateModel;
}

export class DefinitionGroupViewModel implements DefinitionGroupEntity {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id: string;

  @Expose()
  @ApiProperty()
  code: string;

  @Expose()
  @ApiProperty()
  description: string;

  @Expose()
  @ApiProperty()
  isCommon: boolean;

  @Expose()
  @ApiProperty({ type: BaseDateModel })
  date: BaseDateModel;
}

export class DefinitionResponseModel extends DefinitionViewModel {}

export class DefinitionDefinitionGroupResponseModel extends PickType(
  DefinitionResponseModel,
  ['code'] as const,
) {}

export class DefinitionGroupResponseModel extends DefinitionGroupViewModel {}
