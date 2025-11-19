import 'dotenv/config';
import { DataSource } from 'typeorm';

export const DatabaseDataSource = new DataSource({
  type: 'postgres',
  host: process.env.PG_HOSTNAME || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  username: process.env.PG_USERNAME || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DATABASE,
  schema: process.env.PG_SCHEMA,
  entities: ['dist/**/*.entity.js'],
  synchronize: process.env.PG_SYNCHRONIZE === 'true' ? true : false,
  migrations: ['dist/migrations/*.js'],
  migrationsTableName: 'Migrations',
  migrationsRun: false,
  useUTC: true,
});
