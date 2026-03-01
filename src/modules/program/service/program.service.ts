import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgramRepo } from '../repo/program.repo';

@Injectable()
export class ProgramService {
  constructor(private readonly programRepo: ProgramRepo) {}

  async getProgramResponse(programId: string, userId: number) {
    // ── 阶段一：获取 Program 基本信息 ──
    const program = await this.programRepo.findProgramWithDetails(programId);
    if (!program) {
      throw new NotFoundException('Program not found');
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

    // ── 返回（后续步骤会逐步填充 summary, courses, requirements） ──
    return {
      info,
      summary: {
        is_user_program: false,
        is_fulfilled: false,
        completed_courses_count: 0,
        required_courses_count: 0,
      },
      concentration_names,
      courses: {},
      requirements: [],
    };
  }
}
