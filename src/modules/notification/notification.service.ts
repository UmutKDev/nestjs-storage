import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import dayjs from 'dayjs';
import { NotificationType } from '@common/enums';
import { NotificationPayloadModel } from './notification.model';

@Injectable()
export class NotificationService {
  private readonly Logger = new Logger(NotificationService.name);
  private Server: Server;

  /**
   * Called by NotificationGateway.afterInit() to inject the Socket.IO server instance.
   */
  SetServer(server: Server): void {
    this.Server = server;
  }

  /**
   * Emit a notification to a specific user by their room (`user:{UserId}`).
   */
  EmitToUser(
    UserId: string,
    Type: NotificationType,
    Title: string,
    Message: string,
    Data?: Record<string, unknown>,
  ): void {
    if (!this.Server) {
      this.Logger.warn('Socket.IO server not initialized — skipping emission');
      return;
    }

    const payload: NotificationPayloadModel = {
      Type,
      Title,
      Message,
      Data: Data ?? null,
      Timestamp: dayjs().utc().format(),
    };

    this.Server.to(`user:${UserId}`).emit('notification', payload);
    this.Logger.debug(
      `Notification [${Type}] emitted to user:${UserId} — "${Title}"`,
    );
  }

  /**
   * Emit a notification to multiple users.
   */
  EmitToUsers(
    UserIds: string[],
    Type: NotificationType,
    Title: string,
    Message: string,
    Data?: Record<string, unknown>,
  ): void {
    for (const UserId of UserIds) {
      this.EmitToUser(UserId, Type, Title, Message, Data);
    }
  }

  /**
   * Emit a notification to all connected clients (e.g., admin broadcast).
   */
  EmitToAll(
    Type: NotificationType,
    Title: string,
    Message: string,
    Data?: Record<string, unknown>,
  ): void {
    if (!this.Server) {
      this.Logger.warn('Socket.IO server not initialized — skipping emission');
      return;
    }

    const payload: NotificationPayloadModel = {
      Type,
      Title,
      Message,
      Data: Data ?? null,
      Timestamp: dayjs().utc().format(),
    };

    this.Server.emit('notification', payload);
    this.Logger.debug(`Broadcast notification [${Type}] — "${Title}"`);
  }

  /**
   * Check if a user currently has active WebSocket connections.
   */
  async IsUserConnected(UserId: string): Promise<boolean> {
    if (!this.Server) return false;
    const sockets = await this.Server.in(`user:${UserId}`).fetchSockets();
    return sockets.length > 0;
  }

  /**
   * Get count of currently connected unique users.
   */
  async GetConnectedUserCount(): Promise<number> {
    if (!this.Server) return 0;
    const sockets = await this.Server.fetchSockets();
    const uniqueUsers = new Set(
      sockets.map((s) => s.data?.user?.Id).filter(Boolean),
    );
    return uniqueUsers.size;
  }
}
