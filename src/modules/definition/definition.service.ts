import { DefinitionEntity } from '@entities/definition.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DefinitionGroupResponseModel,
  DefinitionResponseModel,
} from './definition.model';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { DefinitionGroupEntity } from '@entities/definition-group.entity';
import { plainToInstance } from 'class-transformer';
import { asyncLocalStorage } from '../../common/context/context.service';
import { RedisService } from '@modules/redis/redis.service';
import { DefinitionKeys } from '@modules/redis/redis.keys';

@Injectable()
export class DefinitionService {
  /** Cache TTL for definition queries (seconds) */
  private readonly DefinitionCacheTtl = 3600; // 1 hour

  constructor(
    @InjectRepository(DefinitionEntity)
    private definitionRepository: Repository<DefinitionEntity>,
    @InjectRepository(DefinitionGroupEntity)
    private definitionGroupRepository: Repository<DefinitionGroupEntity>,
    private readonly RedisService: RedisService,
  ) {}

  async ListGroup({
    model,
  }: {
    model: PaginationRequestModel;
  }): Promise<DefinitionGroupResponseModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    // Try Redis cache first
    const cacheKey = DefinitionKeys.Group(model.Skip, model.Take, model.Search);
    const cached = await this.RedisService.Get<{
      items: DefinitionGroupResponseModel[];
      count: number;
    }>(cacheKey);
    if (cached) {
      request.TotalRowCount = cached.count;
      return cached.items;
    }

    const queryBuilder = this.definitionGroupRepository
      .createQueryBuilder('definitionGroup')
      .skip(model.Skip)
      .take(model.Take);

    if (model.Search) {
      queryBuilder.where('definitionGroup.code LIKE :search', {
        search: `%${model.Search}%`,
      });
    }

    const [result, count] = await queryBuilder.getManyAndCount();

    request.TotalRowCount = count;

    const items = plainToInstance(DefinitionGroupResponseModel, result);
    await this.RedisService.Set(
      cacheKey,
      { items, count },
      this.DefinitionCacheTtl,
    );
    return items;
  }

  async ListDefinition({
    groupCode,
    model,
  }: {
    groupCode: string;
    model: PaginationRequestModel;
  }): Promise<DefinitionResponseModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    // Try Redis cache first
    const cacheKey = DefinitionKeys.ListDefinition(
      groupCode,
      model.Skip,
      model.Take,
      model.Search,
    );
    const cached = await this.RedisService.Get<{
      items: DefinitionResponseModel[];
      count: number;
    }>(cacheKey);
    if (cached) {
      request.TotalRowCount = cached.count;
      return cached.items;
    }

    const queryBuilder = this.definitionRepository
      .createQueryBuilder('definition')
      .leftJoinAndSelect('definition.definitionGroup', 'definitionGroup')
      .select(['definition', 'definitionGroup.code'])
      .where('definitionGroup.code = :groupCode', { groupCode })
      .skip(model.Skip)
      .take(model.Take);

    if (model.Search) {
      queryBuilder.andWhere('definition.code LIKE :search', {
        search: `%${model.Search}%`,
      });
    }

    const [result, count] = await queryBuilder.getManyAndCount();

    request.TotalRowCount = count;

    const items = plainToInstance(DefinitionResponseModel, result);
    await this.RedisService.Set(
      cacheKey,
      { items, count },
      this.DefinitionCacheTtl,
    );
    return items;
  }
}
