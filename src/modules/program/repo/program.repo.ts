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
          select: {
            course_id: true,
            topic: true,
            requirement_id: true,
            combined_group_id: true,
          },
        },
      },
    });
  }

  /** 批量查课程基本信息 + course_attributes */
  findCoursesByIds(courseIds: string[]) {
    return this.prisma.courses.findMany({
      where: { id: { in: courseIds } },
      include: {
        course_attributes: true,
      },
    });
  }

  /**
   * 查 enroll_groups（轻量：不含 sections 链），
   * 用于确定每个 course+topic 应当使用哪个学期。
   */
  findEnrollGroupsByCourseIds(courseIds: string[]) {
    return this.prisma.enroll_groups.findMany({
      where: { course_id: { in: courseIds } },
      select: {
        id: true,
        course_id: true,
        semester: true,
        first_section_number: true,
        topic: true,
        credits_minimum: true,
        credits_maximum: true,
        grading_basis: true,
        session_code: true,
        combined_group_id: true,
      },
    });
  }

  /** 根据 enroll_group IDs 查完整的 sections → meetings → instructors 链 */
  findSectionsByEnrollGroupIds(enrollGroupIds: number[]) {
    return this.prisma.class_sections.findMany({
      where: { enroll_group_id: { in: enrollGroupIds } },
      include: {
        meetings: {
          include: {
            meeting_instructors: {
              include: { instructors: true },
            },
          },
        },
      },
    });
  }

  /** 查同一 combined_group 中的其他课程 ID */
  findCombinedCourseIds(combinedGroupIds: number[]) {
    return this.prisma.enroll_groups.findMany({
      where: { combined_group_id: { in: combinedGroupIds } },
      select: {
        course_id: true,
        combined_group_id: true,
      },
      distinct: ['course_id', 'combined_group_id'],
    });
  }
}
