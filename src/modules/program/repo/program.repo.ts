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

  findRequirementSets(programId: string) {
    return this.prisma.requirement_sets.findMany({
      where: { program_id: programId },
      include: {
        requirement_set_requirements: {
          select: { requirement_id: true },
        },
      },
    });
  }

  findRequirementsByIds(ids: string[]) {
    return this.prisma.requirements.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        ui_type: true,
        description: true,
        concentration_id: true,
        root_node_id: true,
        program_id: true,
      },
    });
  }

  findNodesByRequirementIds(requirementIds: string[]) {
    return this.prisma.requirement_nodes.findMany({
      where: { requirement_id: { in: requirementIds } },
      include: {
        node_children_node_children_parent_node_idTorequirement_nodes: {
          orderBy: { position: 'asc' as const },
          select: { child_node_id: true },
        },
        node_courses: {
          select: { course_id: true, topic: true },
        },
      },
    });
  }
}
