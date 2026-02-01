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

@Injectable()
export class DefinitionService {
  constructor(
    @InjectRepository(DefinitionEntity)
    private definitionRepository: Repository<DefinitionEntity>,
    @InjectRepository(DefinitionGroupEntity)
    private definitionGroupRepository: Repository<DefinitionGroupEntity>,
  ) {}

  async ListGroup({
    model,
  }: {
    model: PaginationRequestModel;
  }): Promise<DefinitionGroupResponseModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

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

    return plainToInstance(DefinitionGroupResponseModel, result);
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

    return plainToInstance(DefinitionResponseModel, result);
  }
}
