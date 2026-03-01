import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgramRepo } from '../repo/program.repo';
import { UserService } from '../../user/service/user.service';
import {
  resolveRequirementIds,
  UserContext,
} from './requirement-resolver';
import { buildRequirementTrees, NodeInput } from './tree-builder';
import { buildCourseOptions } from './course-builder';

@Injectable()
export class ProgramService {
  constructor(
    private readonly programRepo: ProgramRepo,
    private readonly userService: UserService,
  ) {}

  async getProgramResponse(programId: string, userId: number) {
    // ── 阶段一：并行获取 Program 基本信息 + 用户上下文 + Requirement Sets ──
    const [program, userCtx, requirementSets] = await Promise.all([
      this.programRepo.findProgramWithDetails(programId),
      this.userService.findUserContext(userId),
      this.programRepo.findRequirementSets(programId),
    ]);

    if (!program) {
      throw new NotFoundException('Program not found');
    }
    if (!userCtx) {
      throw new NotFoundException('User not found');
    }

    // ── 组装 info ──
    const info = {
      id: program.id,
      name: program.name,
      type: program.type as 'major' | 'minor',
      colleges: program.college_programs.map((cp) => ({
        id: cp.colleges.id,
        name: cp.colleges.name,
      })),
      relevant_subjects: program.program_subjects.map((ps) => ps.subject_id),
    };

    // ── 组装 concentration_names ──
    const concentration_names = program.program_concentrations.map(
      (pc) => pc.concentration_name,
    );

    // ── 阶段二：筛选适用的 requirements ──
    const user: UserContext = {
      entry_year: userCtx.entry_year,
      college_id: userCtx.college_id,
      major_ids: userCtx.user_program.map((up) => up.program_id),
      // 只取当前 program 下的 concentration names
      concentration_names: userCtx.user_concentration
        .map((uc) => uc.program_concentrations)
        .filter((pc) => pc.program_id === programId)
        .map((pc) => pc.concentration_name),
    };

    const requirementIds = resolveRequirementIds(
      {
        year_dependent: program.year_dependent,
        major_dependent: program.major_dependent,
        college_dependent: program.college_dependent,
        concentration_dependent: program.concentration_dependent,
      },
      requirementSets.map((rs) => ({
        id: rs.id,
        applies_to_entry_year: rs.applies_to_entry_year,
        applies_to_college_id: rs.applies_to_college_id,
        applies_to_major_id: rs.applies_to_major_id,
        applies_to_concentration_names:
          rs.applies_to_concentration_names as string[] | null,
        requirement_set_requirements: rs.requirement_set_requirements,
      })),
      user,
    );

    // ── 阶段三：构建 Requirement 树 ──
    const [requirementRows, nodeRows] = await Promise.all([
      this.programRepo.findRequirementsByIds(requirementIds),
      this.programRepo.findNodesByRequirementIds(requirementIds),
    ]);

    // 将 Prisma 的 ugly 命名映射为干净的 NodeInput
    const nodes: NodeInput[] = nodeRows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      pick_count: n.pick_count,
      child_node_ids:
        n.node_children_node_children_parent_node_idTorequirement_nodes.map(
          (c) => c.child_node_id,
        ),
      courses: n.node_courses.map((nc) => ({
        course_id: nc.course_id,
        topic: nc.topic,
        requirement_id: nc.requirement_id,
        combined_group_id: nc.combined_group_id,
      })),
    }));

    const { requirements, courseEntries, courseMetaMap } =
      buildRequirementTrees(
        requirementRows,
        nodes,
        program.program_concentrations,
      );

    // ── 阶段四：获取课程数据并组装 CourseOption 字典 ──
    const courseIds = [...new Set(courseEntries.map((e) => e.course_id))];

    const [courseRows, enrollGroupRows] = await Promise.all([
      this.programRepo.findCoursesByIds(courseIds),
      this.programRepo.findEnrollGroupsByCourseIds(courseIds),
    ]);

    // 收集需要详细 section 数据的 enroll_group IDs
    const selectedEgIds = selectEnrollGroupIds(
      courseEntries,
      enrollGroupRows,
    );

    // 收集 combined_group_ids
    const combinedGroupIds = [
      ...new Set(
        Array.from(courseMetaMap.values())
          .map((m) => m.combined_group_id)
          .filter((id): id is number => id !== null),
      ),
    ];

    // 并行获取 sections 和 combined course 数据
    const [sectionRows, combinedRows] = await Promise.all([
      selectedEgIds.length > 0
        ? this.programRepo.findSectionsByEnrollGroupIds(selectedEgIds)
        : Promise.resolve([]),
      combinedGroupIds.length > 0
        ? this.programRepo.findCombinedCourseIds(combinedGroupIds)
        : Promise.resolve([]),
    ]);

    const courses = buildCourseOptions(
      courseEntries,
      courseMetaMap,
      courseRows,
      enrollGroupRows,
      sectionRows,
      combinedRows,
    );

    // ── 返回 ──
    return {
      info,
      summary: {
        is_user_program: userCtx.user_program.some(
          (up) => up.program_id === programId,
        ),
        is_fulfilled: false,
        completed_courses_count: 0,
        required_courses_count: 0,
      },
      concentration_names,
      courses,
      requirements,
    };
  }
}

// ── 辅助：为每个 courseEntry 选定学期，返回需要查 section 的 enroll_group IDs ──

import { CURRENT_SEMESTER } from '../../../common/constants';
import { latestSemester } from '../../../common/semester';
import { courseKey } from './course-key';

function selectEnrollGroupIds(
  courseEntries: { course_id: string; topic: string }[],
  allEnrollGroups: {
    id: number;
    course_id: string;
    semester: string;
    topic: string | null;
  }[],
): number[] {
  const ids: number[] = [];

  for (const entry of courseEntries) {
    // 筛选匹配的 enroll groups
    const matching = allEnrollGroups.filter((eg) => {
      if (eg.course_id !== entry.course_id) return false;
      if (entry.topic && (eg.topic ?? '') !== entry.topic) return false;
      return true;
    });

    // 选学期
    const semesters = [...new Set(matching.map((eg) => eg.semester))];
    const targetSemester = semesters.includes(CURRENT_SEMESTER)
      ? CURRENT_SEMESTER
      : latestSemester(semesters);

    if (targetSemester) {
      for (const eg of matching) {
        if (eg.semester === targetSemester) {
          ids.push(eg.id);
        }
      }
    }
  }

  return [...new Set(ids)];
}
