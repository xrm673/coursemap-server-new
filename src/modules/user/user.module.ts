import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserRepo } from './repo/user.repo';
import { UserService } from './service/user.service';

@Module({
  imports: [PrismaModule],
  providers: [UserRepo, UserService],
  exports: [UserService],
})
export class UserModule {}
