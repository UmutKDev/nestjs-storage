import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// Replace __Name__ with module name, __kebab__ with kebab-case

@Module({
  imports: [TypeOrmModule.forFeature([__Name__Entity])],
  controllers: [__Name__Controller],
  providers: [__Name__Service],
})
export class __Name__Module {}
