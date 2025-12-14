export const jwtConstants = {
  secret: process.env.JWT_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiresIn: parseInt(process.env.JWT_EXPIRES_IN, 10),
  refreshTokenExpiresIn: parseInt(process.env.JWT_REFRESH_EXPIRES_IN, 10),
  twoFactorSecret: process.env.JWT_TWO_FACTOR_SECRET || process.env.JWT_SECRET,
  twoFactorTokenExpiresIn: parseInt(
    process.env.JWT_TWO_FACTOR_EXPIRES_IN || '300',
    10,
  ),
};
