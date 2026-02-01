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
  Messages: Array<string>;
  @ApiProperty({
    default: 200,
  })
  Code: number;
  @ApiProperty()
  Timestamp: string;
  @ApiProperty()
  Path: string;
}

export class BaseResponseModel<T> {
  @ApiProperty()
  Result: T;

  @ApiProperty()
  Status: BaseStatusModel;
}

export class ArrayResponseModel<T> {
  @ApiProperty()
  Options: PaginationResponseModel;

  @ApiProperty({
    isArray: true,
    type: Array<T>,
  })
  Items: Array<T>;
}

export class BaseDateModel {
  @ApiProperty()
  Created: Date;

  @ApiProperty()
  Updated: Date;
}

export class BaseCreateModel {
  @ApiProperty()
  Created: Date;
}

export class BaseAuthorModel {
  @Expose()
  @ApiProperty()
  Created: UserEntity;

  @Expose()
  @ApiProperty()
  Modified: UserEntity;
}

export class BaseIdRequestModel {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  Id: string;
}
