import { Injectable } from '@nestjs/common';
import { UserRepo } from '../repo/user.repo';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepo) {}

  async findByEmail(email: string) {
    return this.userRepo.findByEmail(email);
  }

  async findByNetId(net_id: string) {
    return this.userRepo.findByNetId(net_id);
  }

  async findById(id: number) {
    return this.userRepo.findById(id);
  }

  async create(data: Prisma.usersCreateInput, program_ids: string[]) {
    return this.userRepo.create(data, program_ids);
  }
}
