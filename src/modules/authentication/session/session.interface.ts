import { Role, Status } from '@common/enums';

export interface SessionData {
  Id: string;
  UserId: string;
  Email: string;
  FullName: string;
  Role: Role;
  Status: Status;
  Image: string;
  DeviceInfo: DeviceInfo;
  IpAddress: string;
  CreatedAt: Date;
  ExpiresAt: Date;
  LastActivityAt: Date;
  IsTwoFactorVerified: boolean;
  TwoFactorPending: boolean;
}

export interface DeviceInfo {
  UserAgent: string;
  Browser: string;
  Os: string;
  Device: string;
}

export interface SessionListItem {
  Id: string;
  DeviceInfo: DeviceInfo;
  IpAddress: string;
  CreatedAt: Date;
  LastActivityAt: Date;
  IsCurrent: boolean;
}
