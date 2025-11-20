import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CloudFindRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Key: string;
}
