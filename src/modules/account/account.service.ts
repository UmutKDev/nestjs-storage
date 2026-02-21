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
import { RedisService } from '@modules/redis/redis.service';
import { AccountKeys } from '@modules/redis/redis.keys';

@Injectable()
export class AccountService {
  /** Cache TTL for profile (seconds) */
  private readonly ProfileCacheTtl = 300; // 5 minutes

  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly RedisService: RedisService,
  ) {}

  async Profile({
    user,
  }: {
    user: UserContext;
  }): Promise<AccountProfileResponseModel> {
    // Try Redis cache first
    const cacheKey = AccountKeys.Profile(user.Id);
    const cached =
      await this.RedisService.Get<AccountProfileResponseModel>(cacheKey);
    if (cached) return cached;

    const query = await this.userRepository
      .findOneOrFail({
        where: { Id: user.Id },
        relations: ['Subscription'],
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
      Id: query.Id,
      Email: query.Email,
      FullName: query.FullName,
      PhoneNumber: query.PhoneNumber,
      Image: query.Image,
      Role: query.Role,
      Status: query.Status,
      Subscription: query.Subscription,
      Date: query.Date,
    };

    const result = plainToInstance(AccountProfileResponseModel, userQuery);
    await this.RedisService.Set(cacheKey, result, this.ProfileCacheTtl);
    return result;
  }

  async Edit({
    user,
    model,
  }: {
    user: UserContext;
    model: AccountPutBodyRequestModel;
  }): Promise<boolean> {
    const findedNumber = await this.userRepository.findOneBy({
      PhoneNumber: model.PhoneNumber,
    });

    if (
      findedNumber?.PhoneNumber &&
      model.PhoneNumber &&
      findedNumber.Id !== user.Id
    ) {
      throw new HttpException('This phoneNumber number already exist', 400);
    }

    try {
      await this.userRepository.update(
        { Id: user.Id },
        {
          FullName: model.FullName,
          PhoneNumber: model.PhoneNumber,
        },
      );

      // Invalidate profile cache
      await this.RedisService.Delete(AccountKeys.Profile(user.Id));

      return true;
    } catch (error) {
      throw new HttpException(
        error instanceof HttpException
          ? error.message
          : 'Failed to update profile',
        error instanceof HttpException ? error.getStatus() : 400,
      );
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
        where: { Id: user.Id },
        select: ['Id', 'Password'],
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
      rUser?.Password,
      model.CurrentPassword,
    );

    if (!comparePassword) {
      throw new HttpException(Codes.Error.Password.WRONG, 400);
    }

    const hashedPassword = await argon2.hash(model.NewPassword);

    await this.userRepository.update(
      { Id: user.Id },
      { Password: hashedPassword },
    );

    // Invalidate profile cache
    await this.RedisService.Delete(AccountKeys.Profile(user.Id));

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
  //       userId: user.Id,
  //       name: 'image',
  //       subPath: `${CloudPaths.USER}/${user.Id}`,
  //       file: image,
  //     })
  //     .then(async (e) => {
  //       await this.userRepository.update(
  //         { Id: user.Id },
  //         { image: e.path.key },
  //       );
  //       return e;
  //     });

  //   return uploadCloud.path.url;
  // }
}
