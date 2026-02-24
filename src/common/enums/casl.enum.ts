export enum CaslAction {
  Manage = 'Manage',
  Create = 'Create',
  Read = 'Read',
  Update = 'Update',
  Delete = 'Delete',
  Upload = 'Upload',
  Download = 'Download',
  Extract = 'Extract',
  Archive = 'Archive',
  Execute = 'Execute',
}

export enum CaslSubject {
  All = 'All',
  User = 'User',
  Subscription = 'Subscription',
  MySubscription = 'MySubscription',
  Cloud = 'Cloud',
  CloudDirectory = 'CloudDirectory',
  CloudUpload = 'CloudUpload',
  CloudArchive = 'CloudArchive',
  Account = 'Account',
  Session = 'Session',
  Passkey = 'Passkey',
  TwoFactor = 'TwoFactor',
  ApiKey = 'ApiKey',
  Definition = 'Definition',
}
