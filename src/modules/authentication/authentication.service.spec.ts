import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticationService } from './authentication.service';
import { UserEntity } from '@entities/user.entity';
import { RefreshTokenEntity } from '@entities/refresh-token.entity';
import { MailService } from '../mail/mail.service';
import { jwtConstants } from './authentication.constants';
import { Modules, Role, Status } from '@common/enums';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  let userRepository: Repository<UserEntity>;
  let refreshTokenRepository: Repository<RefreshTokenEntity>;
  let jwtService: JwtService;
  let mailService: MailService;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    password: 'hashedPassword',
    fullName: 'Test User',
    role: Role.OWNER,
    status: Status.ACTIVE,
    organization: { id: 'org-id', modules: [Modules.DEFAULT] },
    branch: { id: 'branch-id' },
    lastLoginAt: new Date(),
  };

  const mockRefreshToken = {
    id: 'token-id',
    token: 'refresh-token',
    userId: 'user-id',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    isRevoked: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOneOrFail: jest.fn().mockResolvedValue(mockUser),
              update: jest.fn().mockResolvedValue({ affected: 1 }),
              findOne: jest.fn().mockResolvedValue(mockUser),
              findOneOrFail: jest.fn().mockResolvedValue(mockUser),
              manager: {
                connection: {
                  createQueryRunner: jest.fn(() => ({
                    connect: jest.fn(),
                    startTransaction: jest.fn(),
                    commitTransaction: jest.fn(),
                    rollbackTransaction: jest.fn(),
                    release: jest.fn(),
                    manager: {
                      save: jest.fn().mockResolvedValue(mockUser),
                    },
                  })),
                },
              },
            })),
          },
        },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: {
            save: jest.fn().mockResolvedValue(mockRefreshToken),
            findOne: jest.fn().mockResolvedValue(mockRefreshToken),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn(() => ({
              delete: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 5 }),
            })),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest
              .fn()
              .mockResolvedValueOnce('access-token')
              .mockResolvedValueOnce('refresh-token'),
            verifyAsync: jest.fn().mockResolvedValue({
              id: 'user-id',
              email: 'test@example.com',
            }),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendMail: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<AuthenticationService>(AuthenticationService);
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
    refreshTokenRepository = module.get<Repository<RefreshTokenEntity>>(
      getRepositoryToken(RefreshTokenEntity),
    );
    jwtService = module.get<JwtService>(JwtService);
    mailService = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Login', () => {
    it('should return access and refresh tokens', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await service.Login(loginData);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBe(900);
    });
  });

  describe('RefreshToken', () => {
    it('should generate new tokens when refresh token is valid', async () => {
      const refreshData = {
        refreshToken: 'valid-refresh-token',
      };

      const result = await service.RefreshToken(refreshData);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBe(900);
    });
  });

  describe('RevokeRefreshToken', () => {
    it('should revoke a refresh token', async () => {
      const result = await service.RevokeRefreshToken('token-to-revoke');
      expect(result).toBe(true);
    });
  });

  describe('CleanupExpiredTokens', () => {
    it('should cleanup expired tokens', async () => {
      const result = await service.CleanupExpiredTokens();
      expect(result).toBe(5);
    });
  });
});

