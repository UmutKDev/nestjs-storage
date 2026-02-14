import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { asyncLocalStorage } from '../../common/context/context.service';
import { PaginationRequestModel } from '@common/models/pagination.model';
// Replace __Name__ with module name, __name__ with entity alias (camelCase)
// import { __Name__Entity } from '@entities/__kebab__.entity';
// import { __Name__ListResponseModel, __Name__FindResponseModel } from './__kebab__.model';

@Injectable()
export class __Name__Service {
  constructor(
    @InjectRepository(__Name__Entity)
    private __name__Repository: Repository<__Name__Entity>,
  ) {}

  async List({
    model,
  }: {
    model: PaginationRequestModel;
  }): Promise<__Name__ListResponseModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const queryBuilder = this.__name__Repository
      .createQueryBuilder('__name__')
      .skip(model.Skip)
      .take(model.Take);

    if (model.Search) {
      queryBuilder.where('__name__.Name LIKE :search', {
        search: `%${model.Search}%`,
      });
    }

    const [result, count] = await queryBuilder.getManyAndCount();
    request.TotalRowCount = count;

    return plainToInstance(__Name__ListResponseModel, result);
  }

  async Find({
    model,
  }: {
    model: { Id: string };
  }): Promise<__Name__FindResponseModel> {
    const entity = await this.__name__Repository
      .createQueryBuilder('__name__')
      .where('__name__.Id = :id', { id: model.Id })
      .getOneOrFail()
      .catch((error) => {
        if (error.name === 'EntityNotFoundError')
          throw new HttpException('NOT_FOUND', HttpStatus.BAD_REQUEST);
        throw error;
      });

    return plainToInstance(__Name__FindResponseModel, entity);
  }

  async Create({ model }: { model: any }): Promise<boolean> {
    const entity = this.__name__Repository.create({ ...model });
    await this.__name__Repository.save(entity);
    return true;
  }

  async Edit({ id, model }: { id: string; model: any }): Promise<boolean> {
    await this.__name__Repository.update({ Id: id }, { ...model });
    return true;
  }

  async Delete({ model }: { model: { Id: string } }): Promise<boolean> {
    await this.__name__Repository.softDelete({ Id: model.Id });
    return true;
  }
}
