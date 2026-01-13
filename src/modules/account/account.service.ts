import { HttpException, Injectable } from '@nestjs/common';
import {
  AccountChangePasswordRequestModel,
  AccountProfileResponseModel,
  AccountPutBodyRequestModel,
} from './account.model';
import * as argon2 from 'argon2';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@entities//user.entity';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    // private readonly uploadService: UploadService,
  ) {}

  async Profile({
    user,
  }: {
    user: UserContext;
  }): Promise<AccountProfileResponseModel> {
    const query = await this.userRepository
      .findOneOrFail({
        where: { id: user.id },
        relations: ['subscription'],
      })
      .catch((error: Error) => {
        if (
          error.name === Codes.Error.Database.EntityMetadataNotFoundError ||
          error.name === Codes.Error.Database.EntityNotFoundError
        )
          throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

        throw error;
      });

    const userQuery: AccountProfileResponseModel = {
      ...query,
      subscription: query.subscription,
      date: query.date,
    };

    return plainToInstance(AccountProfileResponseModel, userQuery);
  }

  async Edit({
    user,
    model,
  }: {
    user: UserContext;
    model: AccountPutBodyRequestModel;
  }): Promise<boolean> {
    const findedNumber = await this.userRepository.findOneBy({
      phoneNumber: model.phoneNumber,
    });

    if (
      findedNumber?.phoneNumber &&
      model.phoneNumber &&
      findedNumber.id !== user.id
    ) {
      throw new HttpException('This phoneNumber number already exist', 400);
    }

    try {
      await this.userRepository.update({ id: user.id }, model);

      return true;
    } catch (error) {
      throw new HttpException(error, 400);
    }
  }

  async ChangePassword({
    user,
    model,
  }: {
    user: UserContext;
    model: AccountChangePasswordRequestModel;
  }): Promise<boolean> {
    const rUser = await this.userRepository
      .findOneOrFail({
        where: { id: user.id },
        select: ['id', 'password'],
      })
      .catch((error: Error) => {
        if (
          error.name === Codes.Error.Database.EntityMetadataNotFoundError ||
          error.name === Codes.Error.Database.EntityNotFoundError
        )
          throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

        throw error;
      });

    const comparePassword = await argon2.verify(
      rUser?.password,
      model.current_password,
    );

    if (!comparePassword) {
      throw new HttpException(Codes.Error.Password.WRONG, 400);
    }

    await this.userRepository.update(
      { id: user.id },
      { password: model.new_password },
    );

    return true;
  }

  // async UploadImage({
  //   user,
  //   image,
  // }: {
  //   user: UserContext;
  //   image: Express.Multer.File;
  // }): Promise<string> {
  //   const uploadCloud = await this.uploadService
  //     .uploadOne({
  //       userId: user.id,
  //       name: 'image',
  //       subPath: `${CloudPaths.USER}/${user.id}`,
  //       file: image,
  //     })
  //     .then(async (e) => {
  //       await this.userRepository.update(
  //         { id: user.id },
  //         { image: e.path.key },
  //       );
  //       return e;
  //     });

  //   return uploadCloud.path.url;
  // }
}
