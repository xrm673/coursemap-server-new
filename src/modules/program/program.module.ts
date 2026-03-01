import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserModule } from '../user/user.module';
import { ProgramRepo } from './repo/program.repo';
import { ProgramService } from './service/program.service';
import { ProgramController } from './controller/program.controller';

@Module({
  imports: [PrismaModule, UserModule],
  providers: [ProgramRepo, ProgramService],
  controllers: [ProgramController],
})
export class ProgramModule {}
