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
  Search: string;

  @ApiProperty({ required: false, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  Skip: number = 0;

  @ApiProperty({ required: false, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  Take: number = 0;

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
  Search: string = null;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  Skip: number = 0;

  @Expose()
  @Transform(({ value }) => Number(value))
  @ApiProperty()
  Take: number = 0;

  @Expose()
  @ApiProperty()
  Count: number = 0;

  // sort?: object
}
