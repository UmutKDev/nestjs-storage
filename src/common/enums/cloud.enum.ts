enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
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
  SUBFOLDER = 'SUBFOLDER',
}

enum CloudDirectoryType {
  FOLDER = 'FOLDER',
}

enum CloudBreadcrumbLevelType {
  ROOT = 'ROOT',
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
