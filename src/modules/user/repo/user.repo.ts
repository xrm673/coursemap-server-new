import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.users.findUnique({ where: { email } });
  }

  async findByNetId(netid: string) {
    return this.prisma.users.findUnique({ where: { netid } });
  }

  async findById(id: number) {
    return this.prisma.users.findUnique({ where: { id } });
  }

  async create(
    data: Prisma.usersCreateInput,
    program_ids: string[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.users.create({ data });

      if (program_ids.length > 0) {
        await tx.user_program.createMany({
          data: program_ids.map((program_id) => ({
            user_id: user.id,
            program_id,
          })),
        });
      }

      return user;
    });
  }
}
