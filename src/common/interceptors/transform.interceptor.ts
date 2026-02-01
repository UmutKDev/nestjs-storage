import { BaseResponseModel, BaseStatusModel } from '@common/models/base.model';
import { PaginationResponseModel } from '@common/models/pagination.model';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import dayjs from 'dayjs';
import { Observable, map } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<BaseResponseModel<Record<never, never>>> {
    const request = context.switchToHttp().getRequest();

    const status: BaseStatusModel = {
      Messages: ['OK'],
      Code: 200,
      Timestamp: dayjs().utc().format(),
      Path: request.url,
    };

    const result = next.handle().pipe(
      map((data) => ({
        Result:
          data instanceof Array
            ? {
                Options: plainToInstance(
                  PaginationResponseModel,
                  {
                    Search: request.query.search,
                    Skip: request.query.skip,
                    Take: request.query.take,
                    Count: request.TotalRowCount,
                    // sort: {
                    //   field: null,
                    //   direction: null,
                    // },
                  },
                  {
                    excludeExtraneousValues: true,
                    exposeDefaultValues: true,
                  },
                ),
                Items: data,
              }
            : data,
        Status: status,
      })),
    );

    return result;
  }
}
