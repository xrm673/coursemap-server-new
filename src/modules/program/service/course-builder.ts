/**
 * 组装 CourseOption 字典。
 * 接收从 Repo 查出的原始数据，返回 Record<courseKey, CourseOption>。
 */

import {
  CURRENT_SEMESTER,
  UNAVAILABLE_LOCATIONS,
} from '../../../common/constants';
import { latestSemester } from '../../../common/semester';
import { courseKey } from './course-key';
import { CourseEntry, CourseMeta } from './tree-builder';
import { UserCourseInput, UnappliesToEntry } from './fulfillment';

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
  /** 用户选课信息（fulfillment 引擎的输入） */
  userCourseMap: Map<string, UserCourseInput>,
  /** 每门课 apply 到的 requirement_ids */
  courseApplied: Map<string, string[]>,
  /** 每门课无法 apply 的 requirement 列表 */
  courseUnapplied: Map<string, UnappliesToEntry[]>,
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

    // 组装 enrollGroups（含 sections → meetings → instructors）
    const enrollGroups = selectedEgs.map((eg) => ({
      id: eg.id,
      semester: eg.semester,
      firstSectionNumber: eg.first_section_number,
      topic: eg.topic,
      creditsMinimum: eg.credits_minimum,
      creditsMaximum: eg.credits_maximum,
      gradingBasis: eg.grading_basis,
      sessionCode: eg.session_code,
      combinedGroupId: eg.combined_group_id,
      classSections: (sectionsByEgId.get(eg.id) ?? []).map(buildSection),
    }));

    // 组装 combinedCourseInfo
    const combinedGroupId = meta?.combined_group_id ?? null;
    const combinedCourseIds = combinedGroupId
      ? (combinedCourseMap.get(combinedGroupId) ?? []).filter(
          (id) => id !== entry.course_id,
        )
      : [];

    // 用户状态
    const uc = userCourseMap.get(key);
    const applies = courseApplied.get(key) ?? [];
    const unapplies = courseUnapplied.get(key) ?? [];

    result[key] = {
      id: entry.course_id,
      topic: entry.topic,
      type: 'COURSE',
      courseInfo: {
        subject: course.subject,
        number: course.number,
        level: course.level,
        titleShort: course.title_short,
        titleLong: course.title_long,
        description: course.description,
        enrollmentPriority: course.enrollment_priority,
        forbiddenOverlaps: course.forbidden_overlaps,
        prereq: course.prereq,
        coreq: course.coreq,
        fee: course.fee,
        acadCareer: course.acad_career,
        acadGroup: course.acad_group,
        lastOfferedSemester: course.last_offered_semester,
        lastOfferedYear: course.last_offered_year,
        courseAttributes: course.course_attributes.map((a) => ({
          attributeValue: a.attribute_value,
          attributeType: a.attribute_type,
        })),
        satisfiesRequirements: meta?.requirement_ids ?? [],
      },
      enrollGroups: enrollGroups,
      userState: {
        status: uc?.status ?? 'NOT_ON_SCHEDULE',
        isScheduled: uc?.is_scheduled ?? false,
        creditsReceived: uc?.credits_received ?? null,
        semester: uc?.semester ?? null,
        sectionNumbers: uc?.section_numbers ?? [],
        isSemesterAvailable: isSemesterAvailable,
        isLocationAvailable: !enrollGroups
          .flatMap((eg) => eg.classSections)
          .some(
            (s) => s.location && UNAVAILABLE_LOCATIONS.includes(s.location),
          ),
        appliesToRequirements: applies,
        unappliesToRequirements: unapplies,
      },
      combinedCourseInfo: {
        combinedGroupId: combinedGroupId,
        combinedCourseIds: combinedCourseIds,
      },
    };
  }

  return result;
}

// ── 辅助：组装 section ──

function buildSection(section: SectionRow) {
  return {
    id: section.id,
    sectionType: section.section_type,
    sectionNumber: section.section_number,
    classNbr: section.class_nbr,
    location: section.location,
    campus: section.campus,
    startDate: formatDate(section.start_date),
    endDate: formatDate(section.end_date),
    addConsent: section.add_consent,
    isComponentGraded: section.is_component_graded,
    instructionMode: section.instruction_mode,
    sectionTopic: section.section_topic,
    openStatus: section.open_status,
    meetings: section.meetings.map((m) => ({
      id: m.id,
      timeStart: m.time_start,
      timeEnd: m.time_end,
      pattern: m.pattern,
      startDate: formatDate(m.start_date),
      endDate: formatDate(m.end_date),
      instructors: m.meeting_instructors.map((mi) => ({
        netid: mi.instructors.netid,
        firstName: mi.instructors.first_name,
        middleName: mi.instructors.middle_name,
        lastName: mi.instructors.last_name,
      })),
    })),
  };
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}
