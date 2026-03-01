import { Injectable } from '@nestjs/common';
import { UserRepo } from '../repo/user.repo';
import { Prisma } from '@prisma/client';

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

  async create(data: Prisma.usersCreateInput, program_ids: string[]) {
    return this.userRepo.create(data, program_ids);
  }

  async findUserContext(userId: number) {
    return this.userRepo.findUserContext(userId);
  }
}
