import mongoose from 'mongoose';

// Propaga la sesión a todos los modelos de una operación, incluso entre servicios.
mongoose.set('transactionAsyncLocalStorage', true);

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongodb.uri'),
        // Reutiliza un pool acotado durante la vida de cada instancia serverless.
        maxPoolSize: 5,
        minPoolSize: 0,
        maxIdleTimeMS: 60_000,
        serverSelectionTimeoutMS: 5_000,
      }),
    }),
  ],
})
export class DatabaseModule {}
