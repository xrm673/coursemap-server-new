import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ProgramRepo {
  constructor(private readonly prisma: PrismaService) {}

  findProgramWithDetails(programId: string) {
    return this.prisma.programs.findUnique({
      where: { id: programId },
      include: {
        college_programs: {
          include: { colleges: true },
        },
        program_subjects: true,
        program_concentrations: {
          orderBy: { concentration_name: 'asc' as const },
        },
      },
    });
  }
}
