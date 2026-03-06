import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UserProgramDto } from '../../auth/dto/sign-up.dto';

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

  async findByIdWithDetails(id: number) {
    return this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        netid: true,
        email: true,
        first_name: true,
        last_name: true,
        entry_year: true,
        colleges: {
          select: { id: true, name: true },
        },
        user_program: {
          select: {
            programs: {
              select: { id: true, name: true, type: true },
            },
          },
        },
        user_concentration: {
          select: {
            program_concentrations: {
              select: { program_id: true, concentration_name: true },
            },
          },
        },
      },
    });
  }

  async findUserContext(userId: number) {
    return this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        entry_year: true,
        college_id: true,
        user_program: {
          select: { program_id: true },
        },
        user_concentration: {
          select: {
            program_concentrations: {
              select: {
                program_id: true,
                concentration_name: true,
              },
            },
          },
        },
      },
    });
  }

  async create(
    data: Prisma.usersCreateInput,
    programs: UserProgramDto[],
  ) {
    // 预先查出所有需要的 concentration_id，不放在 transaction 里以便提前报错
    const concentrationRows: { user_id_placeholder: true; concentration_id: number }[] = [];

    for (const program of programs) {
      for (const name of program.concentrationNames) {
        const row = await this.prisma.program_concentrations.findUnique({
          where: {
            program_id_concentration_name: {
              program_id: program.programId,
              concentration_name: name,
            },
          },
          select: { id: true },
        });

        if (!row) {
          throw new BadRequestException(
            `Concentration "${name}" not found for program "${program.programId}"`,
          );
        }

        concentrationRows.push({ user_id_placeholder: true, concentration_id: row.id });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.users.create({ data });

      if (programs.length > 0) {
        await tx.user_program.createMany({
          data: programs.map(({ programId }) => ({
            user_id: user.id,
            program_id: programId,
          })),
        });
      }

      if (concentrationRows.length > 0) {
        await tx.user_concentration.createMany({
          data: concentrationRows.map(({ concentration_id }) => ({
            user_id: user.id,
            concentration_id,
          })),
        });
      }

      return user;
    });
  }
}
