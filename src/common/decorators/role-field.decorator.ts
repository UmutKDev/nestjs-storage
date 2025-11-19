import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { Role } from '@common/enums';
import { asyncLocalStorage } from '../context/context.service';

export function RequireRole(
  requiredRole: Role,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [requiredRole],
      validator: RequireRoleConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'RequireRole', async: false })
@Injectable()
export class RequireRoleConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    // Eğer değer boş ise kontrol etme (optional field'lar için)
    if (value === undefined || value === null || value === '') {
      return true;
    }

    const [requiredRole] = args.constraints;

    // AsyncLocalStorage'dan request context'ini al
    const store = asyncLocalStorage.getStore();
    const request = store?.get('request');
    const user = request?.user;

    if (!user) {
      return false;
    }

    return user.role === requiredRole;
  }

  defaultMessage(args: ValidationArguments) {
    const [requiredRole] = args.constraints;
    return `Only users with '${requiredRole}' role can set '${args.property}'`;
  }
}
