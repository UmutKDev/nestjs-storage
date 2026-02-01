import { BaseDateModel } from '@common/models/base.model';
import { DefinitionGroupEntity } from '@entities//definition-group.entity';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class DefinitionViewModel {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  Id: string;

  @Expose()
  @ApiProperty()
  // @Transform(({ value }) => slugify(value))
  Code: string;

  @Expose()
  @ApiProperty()
  Value: string;

  @Expose()
  @ApiProperty()
  Description: string;

  @Expose()
  @ApiProperty()
  Image: string;

  @Expose()
  @ApiProperty()
  IsDefault: boolean;

  @Expose()
  @ApiProperty()
  IsSystem: boolean;

  @Expose()
  @ApiProperty({ type: () => DefinitionDefinitionGroupResponseModel })
  @Type(() => DefinitionDefinitionGroupResponseModel)
  DefinitionGroup: DefinitionGroupEntity;

  @Expose()
  @ApiProperty({ type: BaseDateModel })
  Date: BaseDateModel;
}

export class DefinitionGroupViewModel {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  Id: string;

  @Expose()
  @ApiProperty()
  Code: string;

  @Expose()
  @ApiProperty()
  Description: string;

  @Expose()
  @ApiProperty()
  IsCommon: boolean;

  @Expose()
  @ApiProperty({ type: BaseDateModel })
  Date: BaseDateModel;
}

export class DefinitionResponseModel extends DefinitionViewModel {}

export class DefinitionDefinitionGroupResponseModel extends PickType(
  DefinitionResponseModel,
  ['Code'] as const,
) {}

export class DefinitionGroupResponseModel extends DefinitionGroupViewModel {}
