import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserRepo } from './repo/user.repo';
import { UserService } from './service/user.service';
import { UserController } from './controller/user.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UserController],
  providers: [UserRepo, UserService],
  exports: [UserService],
})
export class UserModule {}
