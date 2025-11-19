import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';

describe('UserController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/api/v1/users (GET)', () => {
    it('should return all users', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should return users with pagination', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users?page=1&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });
  });

  describe('/api/v1/users/:id (GET)', () => {
    it('should return a user by id', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('email');
          expect(res.body).toHaveProperty('firstName');
          expect(res.body).toHaveProperty('lastName');
        });
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/999999')
        .expect(404);
    });

    it('should return 400 for invalid id', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/invalid-id')
        .expect(400);
    });
  });

  describe('/api/v1/users (POST)', () => {
    it('should create a new user', () => {
      const createUserDto = {
        email: 'e2e-test@example.com',
        password: 'password123',
        firstName: 'E2E',
        lastName: 'Test',
      };

      return request(app.getHttpServer())
        .post('/api/v1/users')
        .send(createUserDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.email).toBe(createUserDto.email);
          expect(res.body.firstName).toBe(createUserDto.firstName);
          expect(res.body.lastName).toBe(createUserDto.lastName);
          expect(res.body).not.toHaveProperty('password'); // Password should not be returned
        });
    });

    it('should return 400 for invalid user data', () => {
      const invalidUserDto = {
        email: 'invalid-email',
        password: '123', // Too short
        firstName: '', // Empty
        lastName: '', // Empty
      };

      return request(app.getHttpServer())
        .post('/api/v1/users')
        .send(invalidUserDto)
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(Array.isArray(res.body.message)).toBe(true);
        });
    });

    it('should return 409 for duplicate email', () => {
      const createUserDto = {
        email: 'duplicate@example.com',
        password: 'password123',
        firstName: 'Duplicate',
        lastName: 'User',
      };

      // First request should succeed
      return request(app.getHttpServer())
        .post('/api/v1/users')
        .send(createUserDto)
        .expect(201)
        .then(() => {
          // Second request with same email should fail
          return request(app.getHttpServer())
            .post('/api/v1/users')
            .send(createUserDto)
            .expect(409);
        });
    });
  });

  describe('/api/v1/users/:id (PUT)', () => {
    it('should update an existing user', () => {
      const updateUserDto = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      return request(app.getHttpServer())
        .put('/api/v1/users/1')
        .send(updateUserDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.firstName).toBe(updateUserDto.firstName);
          expect(res.body.lastName).toBe(updateUserDto.lastName);
        });
    });

    it('should return 404 for non-existent user', () => {
      const updateUserDto = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      return request(app.getHttpServer())
        .put('/api/v1/users/999999')
        .send(updateUserDto)
        .expect(404);
    });

    it('should return 400 for invalid update data', () => {
      const invalidUpdateDto = {
        email: 'invalid-email',
        firstName: '', // Empty
      };

      return request(app.getHttpServer())
        .put('/api/v1/users/1')
        .send(invalidUpdateDto)
        .expect(400);
    });
  });

  describe('/api/v1/users/:id (DELETE)', () => {
    it('should delete an existing user', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/users/1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body.message).toContain('deleted');
        });
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/users/999999')
        .expect(404);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for protected routes', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/profile')
        .expect(401);
    });

    it('should require proper authorization for admin routes', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/admin/all')
        .expect(401);
    });
  });
}); 