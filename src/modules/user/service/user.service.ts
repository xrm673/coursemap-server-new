import { Injectable } from '@nestjs/common';
import { UserRepo } from '../repo/user.repo';
import { Prisma } from '@prisma/client';
import { UserProgramDto } from '../../auth/dto/register.dto';

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepo) {}

  async findByEmail(email: string) {
    return this.userRepo.findByEmail(email);
  }

  async findByNetId(netid: string) {
    return this.userRepo.findByNetId(netid);
  }

  async findById(id: number) {
    return this.userRepo.findById(id);
  }

  async create(data: Prisma.usersCreateInput, programs: UserProgramDto[]) {
    return this.userRepo.create(data, programs);
  }

  async findUserContext(userId: number) {
    return this.userRepo.findUserContext(userId);
  }
}
