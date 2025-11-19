enum Role {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
}

enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
  APPROVAL = 'APPROVAL',
}

enum Theme {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  COLORFUL = 'COLORFUL',
  SIMPLE = 'SIMPLE',
}

enum UUID {
  EMPTY = '00000000-0000-0000-0000-000000000000',
}

enum UploadSessionStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ABORTED = 'ABORTED',
}

enum CloudContextLevel {
  ROOT = 'ROOT',
  ORGANIZATION = 'ORGANIZATION',
  SUBFOLDER = 'SUBFOLDER',
}

enum CloudDirectoryType {
  ORGANIZATION = 'ORGANIZATION',
  FOLDER = 'FOLDER',
}

enum CloudBreadcrumbLevelType {
  ROOT = 'ROOT',
  USER = 'USER',
  FOLDER = 'FOLDER',
  CURRENT = 'CURRENT',
}

export {
  Role,
  Status,
  Theme,
  UUID,
  UploadSessionStatus,
  CloudContextLevel,
  CloudDirectoryType,
  CloudBreadcrumbLevelType,
};
