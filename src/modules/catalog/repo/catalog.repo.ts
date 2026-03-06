import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CatalogRepo {
  constructor(private readonly prisma: PrismaService) {}

  findAllColleges() {
    return this.prisma.colleges.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  findAllPrograms() {
    return this.prisma.programs.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        college_programs: {
          select: {
            colleges: { select: { id: true, name: true } },
          },
        },
        program_concentrations: {
          select: { concentration_name: true },
          orderBy: { concentration_name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  findConcentrationsByProgram(programId: string) {
    return this.prisma.program_concentrations.findMany({
      where: { program_id: programId },
      select: { concentration_name: true },
      orderBy: { concentration_name: 'asc' },
    });
  }
}
