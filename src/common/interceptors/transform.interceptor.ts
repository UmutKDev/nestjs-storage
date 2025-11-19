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
      messages: ['OK'],
      code: 200,
      timestamp: dayjs().format() as unknown as Date,
      path: request.url,
    };

    const result = next.handle().pipe(
      map((data) => ({
        result:
          data instanceof Array
            ? {
                options: plainToInstance(
                  PaginationResponseModel,
                  {
                    search: request.query.search,
                    skip: request.query.skip,
                    take: request.query.take,
                    count: request.totalRowCount,
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
                items: data,
              }
            : data,
        status: status,
      })),
    );

    return result;
  }
}

// const pascalizeKeys = (obj) => {
//   if (Array.isArray(obj)) {
//     return obj.map((v) => pascalizeKeys(v));
//   } else if (obj !== null && obj.constructor === Object) {
//     return Object.keys(obj).reduce(
//       (result, key) => ({
//         ...result,
//         [toPascalCase(key)]: pascalizeKeys(obj[key]),
//       }),
//       {},
//     );
//   }
//   return obj;
// };

// const toPascalCase = (str) => startCase(camelCase(str)).replace(/ /g, '');
