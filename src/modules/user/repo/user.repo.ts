import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.users.findUnique({ where: { email } });
  }

  async findByNetId(net_id: string) {
    return this.prisma.users.findUnique({ where: { net_id } });
  }

  async findById(id: number) {
    return this.prisma.users.findUnique({ where: { id } });
  }

  async create(
    data: Prisma.usersCreateInput,
    program_ids: string[],
  ) {
    return this.prisma.users.create({
      data: {
        ...data,
        user_programs: {
          create: program_ids.map((program_id) => ({ program_id })),
        },
      },
      include: { user_programs: true },
    });
  }
}
