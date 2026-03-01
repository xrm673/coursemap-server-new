import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgramRepo } from '../repo/program.repo';
import { UserService } from '../../user/service/user.service';
import {
  resolveRequirementIds,
  UserContext,
} from './requirement-resolver';
import { buildRequirementTrees, NodeInput } from './tree-builder';

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
      })),
    }));

    const { requirements, courseEntries } = buildRequirementTrees(
      requirementRows,
      nodes,
      program.program_concentrations, // 用于查 concentration_name
    );

    // ── 返回（后续步骤会用 courseEntries 获取课程数据并填充 courses 和 fulfillment） ──
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
      courses: {},
      requirements,
      // 临时暴露，方便调试，后续步骤会移除
      _debug: { requirementIds, courseEntries },
    };
  }
}
