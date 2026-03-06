import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProgramModule } from './modules/program/program.module';
import { CatalogModule } from './modules/catalog/catalog.module';

@Module({
  imports: [PrismaModule, UserModule, AuthModule, ProgramModule, CatalogModule],
})
export class AppModule {}
