import {
  computeFulfillment,
  CourseStatus,
  UserCourseInput,
  DomainMembershipInput,
  FulfillmentResult,
} from './fulfillment';

// ── Helpers ──

let autoId = 1;

function createEmptyCourseSetSummary() {
  return {
    isFulfilled: false,
    appliedUnitsCount: 0,
    completedAppliedCourseIds: [] as string[],
    completedUnappliedCourseIds: [] as string[],
    inProgressAppliedCourseIds: [] as string[],
    inProgressUnappliedCourseIds: [] as string[],
    plannedAppliedCourseIds: [] as string[],
    plannedUnappliedCourseIds: [] as string[],
    savedAppliedCourseIds: [] as string[],
    savedUnappliedCourseIds: [] as string[],
  };
}

function createEmptySelectSummary() {
  return {
    isFulfilled: false,
    appliedUnitsCount: 0,
  };
}

function makeCourseSet(
  id: string,
  rule: { required_units_count: number; units_type: 'COURSE' | 'CREDIT' },
  courseKeys: string[],
) {
  return {
    id,
    type: 'COURSE_SET' as const,
    title: '',
    rule,
    requiredCourseIds: courseKeys,
    summary: createEmptyCourseSetSummary(),
  };
}

function makeSelect(
  id: string,
  rule: {
    required_children_count?: number;
    required_units_count?: number;
    units_type?: 'COURSE' | 'CREDIT';
  },
  children: any[],
) {
  return {
    id,
    type: 'SELECT' as const,
    title: '',
    rule,
    children,
    fulfilledChildIds: [] as string[],
    summary: createEmptySelectSummary(),
  };
}

function makeUserCourse(
  courseKey: string,
  status: CourseStatus,
  credits: number | null = null,
): UserCourseInput {
  return {
    id: autoId++,
    course_key: courseKey,
    status,
    is_scheduled: status !== 'SAVED',
    credits_received: credits,
    semester: null,
    section_numbers: [],
    existing_requirement_ids: [],
  };
}

function makeRequirement(id: string, rootNode: any) {
  return { info: { id }, rootNode };
}

/** 检查某门课是否被 apply 到了某个 requirement */
function isApplied(
  result: FulfillmentResult,
  courseKey: string,
  requirementId: string,
): boolean {
  return (result.courseApplied.get(courseKey) ?? []).includes(requirementId);
}

// ── Tests ──

describe('computeFulfillment', () => {
  beforeEach(() => {
    autoId = 1;
  });

  // ────────────────────────────────────────────
  // Group 1: COURSE_SET — units_type: COURSE
  // ────────────────────────────────────────────
  describe('COURSE_SET with units_type COURSE', () => {
    it('should be fulfilled when completed courses >= required_units_count', () => {
      const cs = makeCourseSet(
        'cs1',
        { required_units_count: 3, units_type: 'COURSE' },
        ['CS1110', 'CS2110', 'CS2800', 'CS3110'],
      );
      const req = makeRequirement('req-1', cs);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      expect(result.programFulfilled).toBe(true);
      expect(isApplied(result, 'CS1110', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS2110', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS2800', 'req-1')).toBe(true);
      // summary
      expect(cs.summary.isFulfilled).toBe(true);
      expect(cs.summary.appliedUnitsCount).toBe(3);
    });

    it('should not be fulfilled when completed courses < required_units_count', () => {
      const cs = makeCourseSet(
        'cs1',
        { required_units_count: 3, units_type: 'COURSE' },
        ['CS1110', 'CS2110', 'CS2800', 'CS3110'],
      );
      const req = makeRequirement('req-1', cs);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      expect(result.programFulfilled).toBe(false);
      // summary
      expect(cs.summary.isFulfilled).toBe(false);
      expect(cs.summary.appliedUnitsCount).toBe(2);
    });

    it('should mark extra courses as unapplied when no parent needs them', () => {
      const cs = makeCourseSet(
        'cs1',
        { required_units_count: 2, units_type: 'COURSE' },
        ['CS1110', 'CS2110', 'CS2800'],
      );
      const req = makeRequirement('req-1', cs);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      expect(result.programFulfilled).toBe(true);
      // 独立 COURSE_SET（无父 SELECT），required_units_count 就是 apply 上限
      // 2 门 applied，1 门 unapplied
      expect(cs.summary.completedAppliedCourseIds).toHaveLength(2);
      expect(cs.summary.completedUnappliedCourseIds).toHaveLength(1);
      expect(cs.summary.appliedUnitsCount).toBe(2);
    });
  });

  // ────────────────────────────────────────────
  // Group 2: COURSE_SET — units_type: CREDIT
  // ────────────────────────────────────────────
  describe('COURSE_SET with units_type CREDIT', () => {
    it('should be fulfilled when total credits >= required_units_count', () => {
      const cs = makeCourseSet(
        'cs1',
        { required_units_count: 12, units_type: 'CREDIT' },
        ['PHYS1112', 'PHYS2213', 'PHYS2214', 'PHYS3316'],
      );
      const req = makeRequirement('req-1', cs);
      const userCourses = [
        makeUserCourse('PHYS1112', 'COMPLETED', 4),
        makeUserCourse('PHYS2213', 'COMPLETED', 4),
        makeUserCourse('PHYS2214', 'COMPLETED', 4),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 4 + 4 + 4 = 12 >= 12
      expect(result.programFulfilled).toBe(true);
      expect(isApplied(result, 'PHYS1112', 'req-1')).toBe(true);
      expect(isApplied(result, 'PHYS2213', 'req-1')).toBe(true);
      expect(isApplied(result, 'PHYS2214', 'req-1')).toBe(true);
    });

    it('should not be fulfilled when total credits < required_units_count', () => {
      const cs = makeCourseSet(
        'cs1',
        { required_units_count: 12, units_type: 'CREDIT' },
        ['PHYS1112', 'PHYS2213', 'PHYS2214', 'PHYS3316'],
      );
      const req = makeRequirement('req-1', cs);
      const userCourses = [
        makeUserCourse('PHYS1112', 'COMPLETED', 4),
        makeUserCourse('PHYS2213', 'COMPLETED', 4),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 4 + 4 = 8 < 12
      expect(result.programFulfilled).toBe(false);
    });

    it('should handle mixed credit values correctly', () => {
      const cs = makeCourseSet(
        'cs1',
        { required_units_count: 9, units_type: 'CREDIT' },
        ['MATH1110', 'MATH2210', 'MATH2940'],
      );
      const req = makeRequirement('req-1', cs);
      const userCourses = [
        makeUserCourse('MATH1110', 'COMPLETED', 3),
        makeUserCourse('MATH2210', 'COMPLETED', 4),
        makeUserCourse('MATH2940', 'COMPLETED', 3),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 3 + 4 + 3 = 10 >= 9
      expect(result.programFulfilled).toBe(true);
    });
  });

  // ────────────────────────────────────────────
  // Group 3: SELECT — required_children_count only
  // ────────────────────────────────────────────
  describe('SELECT with required_children_count only', () => {
    it('should be fulfilled when enough children are fulfilled', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 2 },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      expect(result.programFulfilled).toBe(true);
      // SELECT summary
      expect(select.summary.isFulfilled).toBe(true);
      expect(select.summary.appliedUnitsCount).toBe(2);
    });

    it('should not be fulfilled when too few children are fulfilled', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 2 },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [makeUserCourse('CS1110', 'COMPLETED')];

      const result = computeFulfillment([req], userCourses, []);

      expect(result.programFulfilled).toBe(false);
      expect(select.summary.isFulfilled).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // Group 4: SELECT — required_units_count only
  //          (no required_children_count)
  // ────────────────────────────────────────────
  describe('SELECT with required_units_count only', () => {
    it('should be fulfilled when total courses across children >= required', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110', 'CS1112'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110', 'CS2112'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800', 'CS2802'],
      );
      const select = makeSelect(
        'sel1',
        { required_units_count: 6, units_type: 'COURSE' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS1112', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2112', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
        makeUserCourse('CS2802', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 6 courses >= 6
      expect(result.programFulfilled).toBe(true);
      expect(select.summary.isFulfilled).toBe(true);
      expect(select.summary.appliedUnitsCount).toBe(6);
    });

    it('should not be fulfilled when total courses < required', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110', 'CS1112'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110', 'CS2112'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800', 'CS2802'],
      );
      const select = makeSelect(
        'sel1',
        { required_units_count: 6, units_type: 'COURSE' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
        makeUserCourse('CS2802', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 4 < 6
      expect(result.programFulfilled).toBe(false);
      expect(select.summary.isFulfilled).toBe(false);
      expect(select.summary.appliedUnitsCount).toBe(4);
    });
  });

  // ────────────────────────────────────────────
  // Group 5: SELECT — both required_children_count
  //          AND required_units_count
  // ────────────────────────────────────────────
  describe('SELECT with both required_children_count and required_units_count', () => {
    it('should be fulfilled when both conditions are met', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110', 'CS1112'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 4, units_type: 'COURSE' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS1112', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 3 children fulfilled ✅, 4 courses total ✅
      expect(result.programFulfilled).toBe(true);
      expect(select.summary.isFulfilled).toBe(true);
      expect(select.summary.appliedUnitsCount).toBe(4);
    });

    it('should not be fulfilled when children count met but units not met', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 4, units_type: 'COURSE' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 3 children fulfilled ✅, but 3 courses < 4 ❌
      expect(result.programFulfilled).toBe(false);
      expect(select.summary.isFulfilled).toBe(false);
      expect(select.summary.appliedUnitsCount).toBe(3);
    });

    it('should not be fulfilled when units met but children count not met', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 2, units_type: 'COURSE' },
        ['CS1110', 'CS1112'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 2, units_type: 'COURSE' },
        ['CS2110', 'CS2112'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 2, units_type: 'COURSE' },
        ['CS2800'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 4, units_type: 'COURSE' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      // A 和 B 各完成 2 门，C 没有完成
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS1112', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2112', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // A fulfilled ✅, B fulfilled ✅, C not fulfilled ❌ (needs 2, has 0)
      // 2 children < 3 ❌, 4 courses >= 4 ✅
      expect(result.programFulfilled).toBe(false);
      expect(select.summary.isFulfilled).toBe(false);
      expect(select.summary.appliedUnitsCount).toBe(4);
    });
  });

  // ────────────────────────────────────────────
  // Group 6: COURSE_SET required_units_count 不作为
  //          apply 上限——父 SELECT 需要更多时突破限制
  // ────────────────────────────────────────────
  describe('COURSE_SET cap does not block parent needs', () => {
    it('should apply extra courses beyond COURSE_SET requirement to meet parent units (COURSE)', () => {
      // 每个子节点自己只需 1 门，但父 SELECT 需要总共 4 门
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110', 'CS1112'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 4, units_type: 'COURSE' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS1112', 'COMPLETED'), // A 的第 2 门
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // A 的第 2 门不应被 COURSE_SET 的 required_units_count: 1 卡住
      expect(isApplied(result, 'CS1110', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS1112', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS2110', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS2800', 'req-1')).toBe(true);
      expect(result.programFulfilled).toBe(true);
      // SELECT summary: 4 courses applied
      expect(select.summary.isFulfilled).toBe(true);
      expect(select.summary.appliedUnitsCount).toBe(4);
      // COURSE_SET A summary: 2 courses applied despite only needing 1
      expect(csA.summary.appliedUnitsCount).toBe(2);
    });

    it('should apply extra credits beyond COURSE_SET requirement to meet parent credits (CREDIT)', () => {
      // 每个子节点只需 3 学分，但父 SELECT 需要 15 学分
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 3, units_type: 'CREDIT' },
        ['PHYS1112', 'PHYS2213'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 3, units_type: 'CREDIT' },
        ['PHYS2214'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 3, units_type: 'CREDIT' },
        ['PHYS3316'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 15, units_type: 'CREDIT' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('PHYS1112', 'COMPLETED', 4),
        makeUserCourse('PHYS2213', 'COMPLETED', 4), // A 多出来的
        makeUserCourse('PHYS2214', 'COMPLETED', 4),
        makeUserCourse('PHYS3316', 'COMPLETED', 4),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // A 自己只需 3 学分（一门 4 学分课就够），但 PHYS2213 必须 apply
      // 因为总共需要 15 学分：4+4+4+4 = 16 >= 15
      expect(isApplied(result, 'PHYS1112', 'req-1')).toBe(true);
      expect(isApplied(result, 'PHYS2213', 'req-1')).toBe(true);
      expect(isApplied(result, 'PHYS2214', 'req-1')).toBe(true);
      expect(isApplied(result, 'PHYS3316', 'req-1')).toBe(true);
      expect(result.programFulfilled).toBe(true);
      // SELECT summary: 16 credits applied
      expect(select.summary.isFulfilled).toBe(true);
      expect(select.summary.appliedUnitsCount).toBe(16);
      // COURSE_SET A summary: 8 credits applied (2 × 4)
      expect(csA.summary.appliedUnitsCount).toBe(8);
    });
  });

  // ────────────────────────────────────────────
  // Group 7: 域冲突
  // ────────────────────────────────────────────
  describe('domain conflicts', () => {
    it('should not apply a course to two requirements in the same domain', () => {
      const cs1 = makeCourseSet(
        'cs1',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110'],
      );
      const cs2 = makeCourseSet(
        'cs2',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110'],
      );
      const req1 = makeRequirement('req-1', cs1);
      const req2 = makeRequirement('req-2', cs2);
      const userCourses = [makeUserCourse('CS1110', 'COMPLETED')];
      const domains: DomainMembershipInput[] = [
        { domain_id: 1, requirement_id: 'req-1' },
        { domain_id: 1, requirement_id: 'req-2' },
      ];

      const result = computeFulfillment([req1, req2], userCourses, domains);

      // CS1110 只能 apply 到一个 requirement
      const applied = result.courseApplied.get('CS1110') ?? [];
      expect(applied).toHaveLength(1);

      // 另一个应该有 CONFLICT unapply 记录
      const unapplied = result.courseUnapplied.get('CS1110') ?? [];
      expect(unapplied.some((u) => u.reason === 'CONFLICT')).toBe(true);
    });
  });

  // ────────────────────────────────────────────
  // Group 8: 为满足 required_units_count
  //          激活超出 required_children_count 的子节点
  // ────────────────────────────────────────────
  describe('activate extra children beyond required_children_count for units', () => {
    it('should activate a 4th child when 3 are not enough for the units target', () => {
      // SELECT 需要 3 个 children fulfilled + 总共 5 门课
      // A 有 2 门完成，B/C/D 各 1 门，E 没有
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110', 'CS1112'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800'],
      );
      const csD = makeCourseSet(
        'cs-d',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS3110'],
      );
      const csE = makeCourseSet(
        'cs-e',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS3410'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 5, units_type: 'COURSE' },
        [csA, csB, csC, csD, csE],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS1112', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
        makeUserCourse('CS3110', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 只需 3 个 children，但仅靠 A(2)+B(1)+C(1) = 4 门不够 5 门
      // 需要 D 也被激活：A(2)+B(1)+C(1)+D(1) = 5 ✅
      expect(isApplied(result, 'CS1110', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS1112', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS2110', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS2800', 'req-1')).toBe(true);
      expect(isApplied(result, 'CS3110', 'req-1')).toBe(true);
      expect(result.programFulfilled).toBe(true);
      expect(select.summary.isFulfilled).toBe(true);
      expect(select.summary.appliedUnitsCount).toBe(5);
    });

    it('should not need extra children when existing ones already provide enough units', () => {
      // A 有 3 门完成，足够撑起 SELECT 需要的 5 门
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS1110', 'CS1112', 'CS1114'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2110'],
      );
      const csC = makeCourseSet(
        'cs-c',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS2800'],
      );
      const csD = makeCourseSet(
        'cs-d',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS3110'],
      );
      const csE = makeCourseSet(
        'cs-e',
        { required_units_count: 1, units_type: 'COURSE' },
        ['CS3410'],
      );
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 5, units_type: 'COURSE' },
        [csA, csB, csC, csD, csE],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS1112', 'COMPLETED'),
        makeUserCourse('CS1114', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // A(3)+B(1)+C(1) = 5 ✅, 3 children fulfilled ✅
      // D 不需要被激活
      expect(result.programFulfilled).toBe(true);
      expect(isApplied(result, 'CS3110', 'req-1')).toBe(false);
      expect(select.summary.isFulfilled).toBe(true);
      expect(select.summary.appliedUnitsCount).toBe(5);
    });
  });

  // ────────────────────────────────────────────
  // Group 9: Program 级别 requiredCoursesCount /
  //          requiredCreditsCount 的计算
  // ────────────────────────────────────────────
  describe('program-level required counts', () => {
    it('should sum required courses from COURSE type COURSE_SETs', () => {
      const csA = makeCourseSet(
        'cs-a',
        { required_units_count: 3, units_type: 'COURSE' },
        ['CS1110', 'CS2110', 'CS2800', 'CS3110'],
      );
      const csB = makeCourseSet(
        'cs-b',
        { required_units_count: 2, units_type: 'COURSE' },
        ['CS3410', 'CS4410'],
      );
      const req = makeRequirement('req-1', makeSelect('sel1', { required_children_count: 2 }, [csA, csB]));
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
        makeUserCourse('CS3410', 'COMPLETED'),
        makeUserCourse('CS4410', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 3 + 2 = 5
      expect(result.requiredCoursesCount).toBe(5);
      expect(result.requiredCreditsCount).toBe(0);
      expect(result.completedCoursesCount).toBe(5);
    });

    it('should sum required credits from CREDIT type COURSE_SETs', () => {
      const cs = makeCourseSet(
        'cs1',
        { required_units_count: 12, units_type: 'CREDIT' },
        ['PHYS1112', 'PHYS2213', 'PHYS2214', 'PHYS3316'],
      );
      const req = makeRequirement('req-1', cs);
      const userCourses = [
        makeUserCourse('PHYS1112', 'COMPLETED', 4),
        makeUserCourse('PHYS2213', 'COMPLETED', 4),
        makeUserCourse('PHYS2214', 'COMPLETED', 4),
      ];

      const result = computeFulfillment([req], userCourses, []);

      expect(result.requiredCoursesCount).toBe(0);
      expect(result.requiredCreditsCount).toBe(12);
      expect(result.completedCreditsCount).toBe(12);
    });

    it('should use SELECT required_units_count over children sum when present', () => {
      // SELECT 需要 5 门课，但 3 个子节点各只需 1 门
      const csA = makeCourseSet('cs-a', { required_units_count: 1, units_type: 'COURSE' }, ['CS1110', 'CS1112']);
      const csB = makeCourseSet('cs-b', { required_units_count: 1, units_type: 'COURSE' }, ['CS2110']);
      const csC = makeCourseSet('cs-c', { required_units_count: 1, units_type: 'COURSE' }, ['CS2800']);
      const select = makeSelect(
        'sel1',
        { required_children_count: 3, required_units_count: 5, units_type: 'COURSE' },
        [csA, csB, csC],
      );
      const req = makeRequirement('req-1', select);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS1112', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
      ];

      const result = computeFulfillment([req], userCourses, []);

      // 不应该是 1+1+1=3，而是 SELECT 自身的 required_units_count=5
      expect(result.requiredCoursesCount).toBe(5);
    });

    it('should handle mixed COURSE and CREDIT requirements across multiple requirements', () => {
      const cs1 = makeCourseSet('cs1', { required_units_count: 3, units_type: 'COURSE' }, ['CS1110', 'CS2110', 'CS2800']);
      const cs2 = makeCourseSet('cs2', { required_units_count: 12, units_type: 'CREDIT' }, ['PHYS1112', 'PHYS2213', 'PHYS2214']);
      const req1 = makeRequirement('req-1', cs1);
      const req2 = makeRequirement('req-2', cs2);
      const userCourses = [
        makeUserCourse('CS1110', 'COMPLETED'),
        makeUserCourse('CS2110', 'COMPLETED'),
        makeUserCourse('CS2800', 'COMPLETED'),
        makeUserCourse('PHYS1112', 'COMPLETED', 4),
        makeUserCourse('PHYS2213', 'COMPLETED', 4),
        makeUserCourse('PHYS2214', 'COMPLETED', 4),
      ];

      const result = computeFulfillment([req1, req2], userCourses, []);

      expect(result.requiredCoursesCount).toBe(3);
      expect(result.requiredCreditsCount).toBe(12);
      expect(result.completedCoursesCount).toBe(3);
      expect(result.completedCreditsCount).toBe(12);
    });
  });
});
