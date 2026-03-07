import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgramRepo } from '../repo/program.repo';
import { UserService } from '../../user/service/user.service';
import {
  resolveRequirementIds,
  UserContext,
} from './requirement-resolver';
import { buildRequirementTrees, NodeInput } from './tree-builder';
import { buildCourseOptions } from './course-builder';
import {
  computeFulfillment,
  determineStatus,
  UserCourseInput,
} from './fulfillment';
import { CURRENT_SEMESTER } from '../../../common/constants';
import { latestSemester } from '../../../common/semester';
import { courseKey } from './course-key';

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
      relevantSubjects: program.program_subjects.map((ps) => ps.subject_id),
    };

    // ── 组装 concentrationNames ──
    const concentrationNames = program.program_concentrations.map(
      (pc) => pc.concentration_name,
    );

    // ── 阶段二：筛选适用的 requirements ──
    const user: UserContext = {
      entry_year: userCtx.entry_year,
      college_id: userCtx.college_id,
      major_ids: userCtx.user_program.map((up) => up.program_id),
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

    const nodes: NodeInput[] = nodeRows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      rule: n.rule,
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

    // ── 阶段四：获取课程数据 ──
    const courseIds = [...new Set(courseEntries.map((e) => e.course_id))];

    const [courseRows, enrollGroupRows, userCourseRows, domainMemberships] =
      await Promise.all([
        this.programRepo.findCoursesByIds(courseIds),
        this.programRepo.findEnrollGroupsByCourseIds(courseIds),
        this.programRepo.findUserCoursesByCourseIds(userId, courseIds),
        this.programRepo.findDomainMemberships(requirementIds),
      ]);

    // 收集需要详细 section 数据的 enroll_group IDs
    const selectedEgIds = selectEnrollGroupIds(courseEntries, enrollGroupRows);

    // 收集 combined_group_ids
    const combinedGroupIds = [
      ...new Set(
        Array.from(courseMetaMap.values())
          .map((m) => m.combined_group_id)
          .filter((id): id is number => id !== null),
      ),
    ];

    const [sectionRows, combinedRows] = await Promise.all([
      selectedEgIds.length > 0
        ? this.programRepo.findSectionsByEnrollGroupIds(selectedEgIds)
        : Promise.resolve([]),
      combinedGroupIds.length > 0
        ? this.programRepo.findCombinedCourseIds(combinedGroupIds)
        : Promise.resolve([]),
    ]);

    // ── 阶段五：Fulfillment 计算 ──

    // 将 user_courses 映射为 fulfillment 引擎的输入
    // 同一个 courseKey 可能有多条 user_course（不同学期），取优先级最高的
    const userCourseMap = buildUserCourseMap(userCourseRows);

    const fulfillment = computeFulfillment(
      requirements,
      [...userCourseMap.values()],
      domainMemberships,
    );

    // ── 阶段六：组装 CourseOption 字典 ──
    const courses = buildCourseOptions(
      courseEntries,
      courseMetaMap,
      courseRows,
      enrollGroupRows,
      sectionRows,
      combinedRows,
      userCourseMap,
      fulfillment.courseApplied,
      fulfillment.courseUnapplied,
    );

    // ── 阶段七：写回 user_course_requirements（异步，不阻塞响应） ──
    this.programRepo
      .writebackUserCourseRequirements(
        fulfillment.toInsert,
        fulfillment.toDelete,
      )
      .catch((err) => {
        // 写回失败不影响响应，仅记录错误
        console.error('Failed to writeback user_course_requirements:', err);
      });

    // ── 返回 ──
    return {
      info,
      summary: {
        isUserProgram: userCtx.user_program.some(
          (up) => up.program_id === programId,
        ),
        isFulfilled: fulfillment.programFulfilled,
        completedCoursesCount: fulfillment.completedCoursesCount,
        requiredCoursesCount: fulfillment.requiredCoursesCount,
        completedCreditsCount: fulfillment.completedCreditsCount,
        requiredCreditsCount: fulfillment.requiredCreditsCount,
      },
      concentrationNames,
      courses,
      requirements,
    };
  }
}

// ── 辅助函数 ──

/**
 * 将 user_courses Prisma 结果映射为 fulfillment 引擎输入。
 * 同一 courseKey 可能有多条记录（不同学期），取最高优先级的：
 * COMPLETED > IN_PROGRESS > PLANNED > SAVED
 */
function buildUserCourseMap(
  userCourseRows: {
    id: number;
    course_id: string;
    topic: string;
    credits_received: number | null;
    semester: string | null;
    is_scheduled: boolean;
    user_course_requirements: { requirement_id: string }[];
    user_courses_section: {
      class_sections: { section_number: string };
    }[];
  }[],
): Map<string, UserCourseInput> {
  const STATUS_RANK = { COMPLETED: 0, IN_PROGRESS: 1, PLANNED: 2, SAVED: 3 };
  const map = new Map<string, UserCourseInput>();

  for (const row of userCourseRows) {
    const key = courseKey(row.course_id, row.topic);
    const status = determineStatus(row.is_scheduled, row.semester);
    const entry: UserCourseInput = {
      id: row.id,
      course_key: key,
      status,
      is_scheduled: row.is_scheduled,
      credits_received: row.credits_received,
      semester: row.semester,
      section_numbers: row.user_courses_section.map(
        (ucs) => ucs.class_sections.section_number,
      ),
      existing_requirement_ids: row.user_course_requirements.map(
        (ucr) => ucr.requirement_id,
      ),
    };

    const existing = map.get(key);
    if (
      !existing ||
      STATUS_RANK[status] < STATUS_RANK[existing.status] ||
      (STATUS_RANK[status] === STATUS_RANK[existing.status] &&
        row.id < existing.id)
    ) {
      map.set(key, entry);
    }
  }

  return map;
}

/** 为每个 courseEntry 选定学期，返回需要查 section 的 enroll_group IDs */
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
    const matching = allEnrollGroups.filter((eg) => {
      if (eg.course_id !== entry.course_id) return false;
      if (entry.topic && (eg.topic ?? '') !== entry.topic) return false;
      return true;
    });

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
