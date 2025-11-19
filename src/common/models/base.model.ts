import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PaginationResponseModel } from './pagination.model';
import { UserEntity } from '@entities/user.entity';
import { Expose } from 'class-transformer';

export class BaseStatusModel {
  @ApiProperty({
    isArray: true,
    type: 'string',
    default: ['OK'],
  })
  messages: Array<string>;
  @ApiProperty({
    default: 200,
  })
  code: number;
  @ApiProperty()
  timestamp: string;
  @ApiProperty()
  path: string;
}

export class BaseResponseModel<T> {
  @ApiProperty()
  result: T;

  @ApiProperty()
  status: BaseStatusModel;
}

export class ArrayResponseModel<T> {
  @ApiProperty()
  options: PaginationResponseModel;

  @ApiProperty({
    isArray: true,
    type: Array<T>,
  })
  items: Array<T>;
}

export class BaseDateModel {
  @ApiProperty()
  created: Date;

  @ApiProperty()
  updated: Date;
}

export class BaseCreateModel {
  @ApiProperty()
  created: Date;
}

export class BaseAuthorModel {
  @Expose()
  @ApiProperty()
  created: UserEntity;

  @Expose()
  @ApiProperty()
  modified: UserEntity;
}

export class BaseIdRequestModel {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}
