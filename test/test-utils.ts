import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

export interface MockRepository<T = any> {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
  count: jest.Mock;
  findAndCount: jest.Mock;
}

export const createMockRepository = <T = any>(): MockRepository<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  findAndCount: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getRawAndEntities: jest.fn(),
  })),
});

export const createTestingModule = async (
  providers: any[],
  imports: any[] = [],
): Promise<TestingModule> => {
  return Test.createTestingModule({
    imports,
    providers,
  }).compile();
};

export const createTestApp = async (
  module: TestingModule,
): Promise<INestApplication> => {
  const app = module.createNestApplication();
  await app.init();
  return app;
};

export const getRepositoryMock = <T>(
  module: TestingModule,
  entity: any,
): MockRepository<T> => {
  return module.get<MockRepository<T>>(getRepositoryToken(entity));
};

export const createTestUser = (overrides: Partial<any> = {}) => ({
  id: 1,
  email: 'test@example.com',
  password: 'hashedPassword',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestOrganization = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Test Organization',
  description: 'Test organization description',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestBranch = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Test Branch',
  address: 'Test Address',
  phone: '+1234567890',
  isActive: true,
  organizationId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestMenu = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Test Menu',
  description: 'Test menu description',
  isActive: true,
  organizationId: 1,
  branchId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestDefinition = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Test Definition',
  description: 'Test definition description',
  type: 'CATEGORY',
  isActive: true,
  organizationId: 1,
  branchId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const mockJwtPayload = {
  sub: 1,
  email: 'test@example.com',
  organizationId: 1,
  branchId: 1,
  roles: ['USER'],
};

export const mockRequest = (overrides: Partial<any> = {}) => ({
  user: mockJwtPayload,
  headers: {},
  body: {},
  params: {},
  query: {},
  ...overrides,
});

export const mockResponse = (overrides: Partial<any> = {}) => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  ...overrides,
});

export const createPaginationResult = <T>(
  data: T[],
  page: number = 1,
  limit: number = 10,
  total: number = data.length,
) => ({
  data,
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPreviousPage: page > 1,
  },
});

export const expectPaginationResult = (result: any) => {
  expect(result).toHaveProperty('data');
  expect(result).toHaveProperty('meta');
  expect(result.meta).toHaveProperty('page');
  expect(result.meta).toHaveProperty('limit');
  expect(result.meta).toHaveProperty('total');
  expect(result.meta).toHaveProperty('totalPages');
  expect(result.meta).toHaveProperty('hasNextPage');
  expect(result.meta).toHaveProperty('hasPreviousPage');
  expect(Array.isArray(result.data)).toBe(true);
};

export const expectValidationError = (response: any) => {
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('message');
  expect(Array.isArray(response.body.message)).toBe(true);
  expect(response.body.message.length).toBeGreaterThan(0);
};

export const expectNotFoundError = (response: any) => {
  expect(response.status).toBe(404);
  expect(response.body).toHaveProperty('message');
  expect(response.body.message).toContain('not found');
};

export const expectUnauthorizedError = (response: any) => {
  expect(response.status).toBe(401);
  expect(response.body).toHaveProperty('message');
  expect(response.body.message).toContain('Unauthorized');
};

export const expectForbiddenError = (response: any) => {
  expect(response.status).toBe(403);
  expect(response.body).toHaveProperty('message');
  expect(response.body.message).toContain('Forbidden');
};

export const expectConflictError = (response: any) => {
  expect(response.status).toBe(409);
  expect(response.body).toHaveProperty('message');
  expect(response.body.message).toContain('already exists');
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const generateRandomEmail = (): string => {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
};

export const generateRandomString = (length: number = 10): string => {
  return Math.random().toString(36).substring(2, length + 2);
}; 