import { UserEntity } from '@entities/user.entity';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import * as argon2 from 'argon2';

@EventSubscriber()
export class UserSubscriber implements EntitySubscriberInterface<UserEntity> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return UserEntity;
  }

  async beforeUpdate(event: UpdateEvent<UserEntity>) {
    try {
      const user = event.entity;

      const isPasswordChanged = Object.keys(event.entity).includes('password');
      if (isPasswordChanged) {
        event.entity.password = await argon2.hash(user.password);
      }
    } catch (error) {
      throw new Error(error);
    }
  }

  async beforeInsert(event: InsertEvent<UserEntity>) {
    try {
      const user = event.entity;

      event.entity.password = await argon2.hash(user.password);
    } catch (error) {
      throw new Error(error);
    }
  }
}
