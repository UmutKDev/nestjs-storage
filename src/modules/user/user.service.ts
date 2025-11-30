import { HttpException, Injectable } from '@nestjs/common';
import {
  UserPostBodyRequestModel,
  UserPutBodyRequestModel,
  UserResponseModel,
} from './user.model';
import { BaseIdRequestModel } from '@common/models/base.model';
import { PaginationRequestModel } from '@common/models/pagination.model';

import { passwordGenerator } from '@common/helpers/cast.helper';
import { MailService } from '../mail/mail.service';
import { WelcomeTemplate } from '@common/templates/mail';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { UserEntity } from '@entities/user.entity';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';

import { Role, Status } from '@common/enums';
import { plainToInstance } from 'class-transformer';
import { asyncLocalStorage } from '../../common/context/context.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(UserSubscriptionEntity)
    private mailService: MailService,
  ) {}

  async List({
    model,
  }: {
    model: PaginationRequestModel;
  }): Promise<UserResponseModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select(['user'])
      .skip(model.skip)
      .take(model.take)
      .withDeleted();

    if (model.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('user.email LIKE :search', { search: `%${model.search}%` })
            .orWhere('user.fullName LIKE :search', {
              search: `%${model.search}%`,
            })
            .orWhere('user.phoneNumber LIKE :search', {
              search: `%${model.search}%`,
            });
        }),
      );
    }

    const [result, count] = await queryBuilder.getManyAndCount();

    request.totalRowCount = count;

    return plainToInstance(UserResponseModel, result);
  }

  async Find({
    model,
  }: {
    model: BaseIdRequestModel;
  }): Promise<UserResponseModel> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select(['user'])
      .where('user.id = :id', { id: model.id });

    const query = await queryBuilder.getOneOrFail().catch((error) => {
      if (error.name === Codes.Error.Database.EntityNotFoundError)
        throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

      throw error;
    });

    return plainToInstance(UserResponseModel, query);
  }

  async Create({
    model,
  }: {
    model: UserPostBodyRequestModel;
  }): Promise<boolean> {
    const existingUser = await this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.phoneNumber'])
      .where('user.status = :status', { status: Status.ACTIVE })
      .andWhere(
        new Brackets((qb) => {
          qb.where('user.email = :email', { email: model.email }).orWhere(
            'user.phoneNumber = :phoneNumber',
            { phoneNumber: model.phoneNumber },
          );
        }),
      )
      .getOne();

    if (existingUser) {
      if (existingUser.email === model.email) {
        throw new HttpException(Codes.Error.Email.ALREADY_EXISTS, 400);
      }
      if (existingUser.phoneNumber === model.phoneNumber) {
        throw new HttpException(Codes.Error.PhoneNumber.ALREADY_EXISTS, 400);
      }
    }

    const password = passwordGenerator(12);

    const newUser = this.userRepository.create({
      ...model,
      status: Status.ACTIVE,
    });

    await this.userRepository.save(newUser);

    await this.mailService.sendMail({
      to: newUser.email,
      subject: 'QR Menüye Hoşgeldin',
      html: WelcomeTemplate()
        .replace('{Username}', newUser.email)
        .replace('{Password}', password),
    });

    return true;
  }

  async Edit({
    id,
    model,
  }: {
    id: string;
    model: UserPutBodyRequestModel;
  }): Promise<boolean> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.role'])
      .where('user.id = :id', { id });

    await queryBuilder.getOneOrFail().catch((error) => {
      if (error.name === Codes.Error.Database.EntityNotFoundError)
        throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

      throw error;
    });

    await this.userRepository.update({ id }, model);

    return true;
  }

  async Delete({
    user,
    model,
  }: {
    user: UserContext;
    model: BaseIdRequestModel;
  }): Promise<boolean> {
    if (user.id === model.id)
      throw new HttpException("You can't delete yourself", 400);

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.role'])
      .where('user.id = :id', { id: model.id });

    const existingUser = await queryBuilder.getOneOrFail().catch((error) => {
      if (error.name === Codes.Error.Database.EntityNotFoundError)
        throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

      throw error;
    });

    if (existingUser.role === Role.ADMIN)
      throw new HttpException("You can't delete admin user", 403);

    await this.userRepository.softDelete({ id: existingUser.id });

    return true;
  }
}
