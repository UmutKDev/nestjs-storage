export enum TwoFactorMethod {
  TOTP = 'TOTP',
  PASSKEY = 'PASSKEY',
}

export enum ApiKeyEnvironment {
  TEST = 'TEST',
  LIVE = 'LIVE',
}

export enum ApiKeyScope {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  ADMIN = 'ADMIN',
}

export enum AuthenticationType {
  SESSION = 'SESSION',
  API_KEY = 'API_KEY',
}
