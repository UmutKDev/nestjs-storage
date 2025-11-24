import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ArrayResponseModel,
  BaseResponseModel,
} from '@common/models/base.model';

export const ApiSuccessResponse = <GenericType extends Type<unknown>>(
  type: GenericType | 'string' | 'boolean',
) =>
  applyDecorators(
    ApiExtraModels(BaseResponseModel, type as Type),

    ApiOkResponse({
      description: 'Success',
      schema: {
        title:
          typeof type === 'function'
            ? type.name.replace('Model', 'BaseModel')
            : type === 'string'
              ? 'StringResponseModel'
              : 'BooleanResponseModel',
        allOf: [
          {
            $ref: getSchemaPath(BaseResponseModel),
          },
          {
            properties: {
              result: {
                title:
                  typeof type === 'function'
                    ? type.name.replace('Model', 'ResultModel')
                    : type === 'string'
                      ? 'StringResultResponseModel'
                      : 'BooleanResultResponseModel',

                type:
                  type === 'string'
                    ? 'string'
                    : type === 'boolean'
                      ? 'boolean'
                      : undefined,
                $ref:
                  typeof type === 'string' ? undefined : getSchemaPath(type),
              },
            },
          },
        ],
      },
    }),

    ApiInternalServerErrorResponse({
      description: 'Internal Server Error',
      schema: {
        title: 'InternalServerErrorResponseModel',
        allOf: [
          {
            $ref: getSchemaPath(BaseResponseModel),
          },
          {
            properties: {
              result: {
                title: 'StringResponseResultModel',
                type: null,
              },
              status: {
                properties: {
                  code: {
                    type: 'number',
                    example: 500,
                  },
                  message: {
                    type: 'string',
                    example: 'Internal Server Error',
                  },
                },
              },
            },
          },
        ],
      },
    }),
  );

export const ApiSuccessArrayResponse = (type: Type) =>
  applyDecorators(
    ApiExtraModels(ArrayResponseModel, type),

    ApiOkResponse({
      description: 'Success',
      schema: {
        title: type.name.replace('Model', 'ListBaseModel'),
        allOf: [
          { $ref: getSchemaPath(BaseResponseModel) },
          {
            type: 'object',
            title: type.name.replace('Model', 'ListModel'),
            properties: {
              result: {
                allOf: [
                  { $ref: getSchemaPath(ArrayResponseModel) },
                  {
                    type: 'object',
                    properties: {
                      items: {
                        type: 'array',
                        items: { $ref: getSchemaPath(type) },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    }),

    ApiInternalServerErrorResponse({
      description: 'Internal Server Error',
      schema: {
        title: 'InternalServerErrorResponseModel',
        allOf: [
          {
            $ref: getSchemaPath(BaseResponseModel),
          },
          {
            properties: {
              result: {
                title: 'StringResponseResultModel',
                type: 'string',
              },
              status: {
                properties: {
                  code: {
                    type: 'number',
                    example: 500,
                  },
                  message: {
                    type: 'string',
                    example: 'Internal Server Error',
                  },
                },
              },
            },
          },
        ],
      },
    }),
  );
