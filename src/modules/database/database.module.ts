import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseDataSource } from './database.datasource';

@Module({
  imports: [TypeOrmModule.forRoot(DatabaseDataSource.options)],
})
export class DatabaseModule {}
