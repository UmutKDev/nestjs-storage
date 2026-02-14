import { BaseDateModel } from '@common/models/base.model';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

// Replace __Name__ with module name (PascalCase)

// -- Base view model: all fields with @Expose() --
export class __Name__ViewModel {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  Id: string;

  @Expose()
  @ApiProperty()
  @IsString()
  Name: string;

  @Expose()
  @ApiProperty()
  @IsOptional()
  @IsString()
  Description: string;

  @Expose()
  @ApiProperty({ type: BaseDateModel })
  Date: BaseDateModel;
}

// -- Response models --
export class __Name__ResponseModel extends OmitType(
  __Name__ViewModel,
  [] as const,
) {}
export class __Name__ListResponseModel extends __Name__ResponseModel {}
export class __Name__FindResponseModel extends __Name__ResponseModel {}

// -- Request models --
export class __Name__BodyRequestModel extends OmitType(__Name__ViewModel, [
  'Id',
  'Date',
] as const) {}

export class __Name__PostBodyRequestModel extends __Name__BodyRequestModel {}

export class __Name__PutBodyRequestModel extends __Name__BodyRequestModel {
  @IsOptional()
  Name: string;

  @IsOptional()
  Description: string;
}
