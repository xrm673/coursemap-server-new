/**
 * 组装 CourseOption 字典。
 * 接收从 Repo 查出的原始数据，返回 Record<courseKey, CourseOption>。
 */

import { CURRENT_SEMESTER } from '../../../common/constants';
import { latestSemester } from '../../../common/semester';
import { courseKey } from './course-key';
import { CourseEntry, CourseMeta } from './tree-builder';

// ── 输入类型（松散，匹配 Prisma 查询结果即可） ──

interface CourseRow {
  id: string;
  subject: string;
  number: string;
  level: number;
  title_short: string | null;
  title_long: string | null;
  description: string | null;
  enrollment_priority: string | null;
  forbidden_overlaps: string | null;
  prereq: string | null;
  coreq: string | null;
  fee: string | null;
  acad_career: string | null;
  acad_group: string | null;
  last_offered_semester: string | null;
  last_offered_year: number | null;
  course_attributes: { attribute_value: string; attribute_type: string | null }[];
}

interface EnrollGroupRow {
  id: number;
  course_id: string;
  semester: string;
  first_section_number: string;
  topic: string | null;
  credits_minimum: number | null;
  credits_maximum: number | null;
  grading_basis: string | null;
  session_code: string | null;
  combined_group_id: number | null;
}

interface SectionRow {
  id: number;
  enroll_group_id: number;
  section_type: string | null;
  section_number: string;
  class_nbr: number;
  location: string | null;
  campus: string | null;
  start_date: Date | null;
  end_date: Date | null;
  add_consent: string | null;
  is_component_graded: boolean | null;
  instruction_mode: string | null;
  section_topic: string | null;
  open_status: string | null;
  meetings: MeetingRow[];
}

interface MeetingRow {
  id: number;
  time_start: string | null;
  time_end: string | null;
  pattern: string | null;
  start_date: Date | null;
  end_date: Date | null;
  meeting_instructors: {
    instructors: {
      netid: string;
      first_name: string | null;
      middle_name: string | null;
      last_name: string | null;
    };
  }[];
}

interface CombinedRow {
  course_id: string;
  combined_group_id: number | null;
}

// ── 主函数 ──

export function buildCourseOptions(
  courseEntries: CourseEntry[],
  courseMetaMap: Map<string, CourseMeta>,
  courses: CourseRow[],
  allEnrollGroups: EnrollGroupRow[],
  sections: SectionRow[],
  combinedData: CombinedRow[],
): Record<string, any> {
  // ── 构建查找表 ──
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  // sections 按 enroll_group_id 分组
  const sectionsByEgId = new Map<number, SectionRow[]>();
  for (const s of sections) {
    const arr = sectionsByEgId.get(s.enroll_group_id) ?? [];
    arr.push(s);
    sectionsByEgId.set(s.enroll_group_id, arr);
  }

  // combined courses 按 combined_group_id 分组
  const combinedCourseMap = new Map<number, string[]>();
  for (const row of combinedData) {
    if (row.combined_group_id === null) continue;
    const arr = combinedCourseMap.get(row.combined_group_id) ?? [];
    if (!arr.includes(row.course_id)) arr.push(row.course_id);
    combinedCourseMap.set(row.combined_group_id, arr);
  }

  // ── 为每个 courseEntry 选择学期并组装 ──
  const result: Record<string, any> = {};

  for (const entry of courseEntries) {
    const key = courseKey(entry.course_id, entry.topic);
    const course = courseMap.get(entry.course_id);
    if (!course) continue;

    const meta = courseMetaMap.get(key);

    // 筛选匹配的 enroll groups（按 course_id + topic）
    const matchingEgs = allEnrollGroups.filter((eg) => {
      if (eg.course_id !== entry.course_id) return false;
      // 有 topic → 只匹配该 topic；无 topic → 全部匹配
      if (entry.topic && (eg.topic ?? '') !== entry.topic) return false;
      return true;
    });

    // 选学期：优先当前学期，否则最新学期
    const semesters = [...new Set(matchingEgs.map((eg) => eg.semester))];
    const isSemesterAvailable = semesters.includes(CURRENT_SEMESTER);
    const targetSemester = isSemesterAvailable
      ? CURRENT_SEMESTER
      : latestSemester(semesters);

    // 取目标学期的 enroll groups
    const selectedEgs = targetSemester
      ? matchingEgs.filter((eg) => eg.semester === targetSemester)
      : [];

    // 组装 enroll_groups（含 sections → meetings → instructors）
    const enrollGroups = selectedEgs.map((eg) => ({
      id: eg.id,
      semester: eg.semester,
      first_section_number: eg.first_section_number,
      topic: eg.topic,
      credits_minimum: eg.credits_minimum,
      credits_maximum: eg.credits_maximum,
      grading_basis: eg.grading_basis,
      session_code: eg.session_code,
      combined_group_id: eg.combined_group_id,
      class_sections: (sectionsByEgId.get(eg.id) ?? []).map(buildSection),
    }));

    // 组装 combined_course_info
    const combinedGroupId = meta?.combined_group_id ?? null;
    const combinedCourseIds = combinedGroupId
      ? (combinedCourseMap.get(combinedGroupId) ?? []).filter(
          (id) => id !== entry.course_id,
        )
      : [];

    result[key] = {
      id: entry.course_id,
      topic: entry.topic,
      type: 'COURSE',
      course_info: {
        subject: course.subject,
        number: course.number,
        level: course.level,
        title_short: course.title_short,
        title_long: course.title_long,
        description: course.description,
        enrollment_priority: course.enrollment_priority,
        forbidden_overlaps: course.forbidden_overlaps,
        prereq: course.prereq,
        coreq: course.coreq,
        fee: course.fee,
        acad_career: course.acad_career,
        acad_group: course.acad_group,
        last_offered_semester: course.last_offered_semester,
        last_offered_year: course.last_offered_year,
        course_attributes: course.course_attributes.map((a) => ({
          attribute_value: a.attribute_value,
          attribute_type: a.attribute_type,
        })),
        satisfies_requirements: meta?.requirement_ids ?? [],
      },
      enroll_groups: enrollGroups,
      user_state: {
        status: 'NOT_ON_SCHEDULE',
        credits_received: null,
        semester: null,
        sections_numbers: [],
        is_semester_available: isSemesterAvailable,
        is_location_available: false, // Step 6 会计算
        applies_to_requirements: [],
        unapplies_to_requirements: [],
      },
      combined_course_info: {
        combined_group_id: combinedGroupId,
        combined_course_ids: combinedCourseIds,
      },
    };
  }

  return result;
}

// ── 辅助：组装 section ──

function buildSection(section: SectionRow) {
  return {
    id: section.id,
    section_type: section.section_type,
    section_number: section.section_number,
    class_nbr: section.class_nbr,
    location: section.location,
    campus: section.campus,
    start_date: formatDate(section.start_date),
    end_date: formatDate(section.end_date),
    add_consent: section.add_consent,
    is_component_graded: section.is_component_graded,
    instruction_mode: section.instruction_mode,
    section_topic: section.section_topic,
    open_status: section.open_status,
    meetings: section.meetings.map((m) => ({
      id: m.id,
      time_start: m.time_start,
      time_end: m.time_end,
      pattern: m.pattern,
      start_date: formatDate(m.start_date),
      end_date: formatDate(m.end_date),
      instructors: m.meeting_instructors.map((mi) => ({
        netid: mi.instructors.netid,
        first_name: mi.instructors.first_name,
        middle_name: mi.instructors.middle_name,
        last_name: mi.instructors.last_name,
      })),
    })),
  };
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}
