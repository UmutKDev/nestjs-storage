import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class PaginationRequestModel {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  search: string;

  @ApiProperty({ required: false, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  skip: number = 0;

  @ApiProperty({ required: false, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  take: number = 0;

  // @ApiProperty({ required: false })
  // @IsOptional()
  // @IsString()
  // orderByField?: string = null;

  // @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  // @IsOptional()
  // @IsString()
  // orderByDirection?: 'asc' | 'desc' = 'asc';
}

export class PaginationResponseModel {
  @Expose()
  @ApiProperty()
  search: string = null;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  skip: number = 0;

  @Expose()
  @Transform(({ value }) => Number(value))
  @ApiProperty()
  take: number = 0;

  @Expose()
  @ApiProperty()
  count: number = 0;

  // sort?: object
}
