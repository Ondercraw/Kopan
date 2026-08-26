import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.MONGODB_URI =
      process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/panaderia-test';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ??
      'test-jwt-secret-de-al-menos-64-caracteres-para-validacion-e2e-segura';

    const connectionMock = {
      models: {},
      model: jest.fn().mockReturnValue({}),
      close: jest.fn().mockResolvedValue(undefined),
      db: {
        admin: () => ({ ping: jest.fn().mockResolvedValue({ ok: 1 }) }),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getConnectionToken())
      .useValue(connectionMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('/api/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string; database: string };
        expect(body).toMatchObject({
          status: 'ready',
          database: 'connected',
        });
      });
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string };
        expect(body.status).toBe('ok');
      });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
