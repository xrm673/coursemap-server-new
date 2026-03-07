/**
 * 纯函数：计算 fulfillment 状态。
 *
 * 算法流程：
 *   Phase 1 — 自底向上：判断每个节点是否 fulfilled
 *             COURSE_SET: 按 units_type 判断（COURSE 数课程数，CREDIT 数学分）
 *             SELECT: 检查 required_children_count 和/或 required_units_count
 *   Phase 2 — 自顶向下：决定哪些 COURSE_SET 节点是 active
 *             SELECT 有 required_units_count 时，所有 children active
 *   Phase 3 — 收集 COURSE_SET 信息
 *   Phase 4A — 课程分配（按 COURSE_SET 自身 cap）
 *   Phase 4B — 补充分配（满足父级 SELECT 的 required_units_count）
 *   Phase 5A — 填充 COURSE_SET summary（含 applied_units_count）
 *   Phase 5B — 填充 SELECT summary（is_fulfilled + applied_units_count）
 *   Phase 6 — 计算 writeback diff 和 program-level 汇总
 */

import { CURRENT_SEMESTER } from '../../../common/constants';
import { compareSemesters } from '../../../common/semester';
import { courseKey } from './course-key';

// ── 输入类型 ──

export type CourseStatus =
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'PLANNED'
  | 'SAVED';

const STATUS_PRIORITY: Record<CourseStatus, number> = {
  COMPLETED: 0,
  IN_PROGRESS: 1,
  PLANNED: 2,
  SAVED: 3,
};

export interface UserCourseInput {
  id: number;
  course_key: string;
  status: CourseStatus;
  is_scheduled: boolean;
  credits_received: number | null;
  semester: string | null;
  section_numbers: string[];
  /** 已有的 user_course_requirements 绑定 */
  existing_requirement_ids: string[];
}

export interface DomainMembershipInput {
  domain_id: number;
  requirement_id: string;
}

// ── 输出类型 ──

export interface UnappliesToEntry {
  requirementId: string;
  reason: 'OVERLIMIT' | 'CONFLICT' | 'INACTIVE';
  blockedByRequirementId: string;
}

export interface FulfillmentResult {
  /** courseKey → 被 apply 到的 requirement_ids */
  courseApplied: Map<string, string[]>;
  /** courseKey → 无法 apply 的 requirement 列表 */
  courseUnapplied: Map<string, UnappliesToEntry[]>;
  /** 供 service 持久化的 diff */
  toInsert: { user_course_id: number; requirement_id: string }[];
  toDelete: { user_course_id: number; requirement_id: string }[];
  /** program 级别汇总 */
  programFulfilled: boolean;
  completedCoursesCount: number;
  requiredCoursesCount: number;
  completedCreditsCount: number;
  requiredCreditsCount: number;
}

// ── 内部类型 ──

interface CourseSetInfo {
  nodeId: string;
  requirementId: string;
  rule: { required_units_count: number; units_type: 'COURSE' | 'CREDIT' };
  courseKeys: string[];
  isActive: boolean;
  /** 对树节点的引用，用于直接写入 summary */
  node: any;
}

// ── 公开工具：从原始 user_course 确定 status ──

export function determineStatus(
  isScheduled: boolean,
  semester: string | null,
): CourseStatus {
  if (!isScheduled) return 'SAVED';
  if (semester === null) return 'COMPLETED';
  const cmp = compareSemesters(semester, CURRENT_SEMESTER);
  if (cmp < 0) return 'COMPLETED';
  if (cmp === 0) return 'IN_PROGRESS';
  return 'PLANNED';
}

// ── 主函数 ──

export function computeFulfillment(
  requirements: { info: { id: string }; rootNode: any }[],
  userCourses: UserCourseInput[],
  domainMemberships: DomainMembershipInput[],
): FulfillmentResult {
  // courseKey → UserCourseInput
  const courseStatusMap = new Map<string, UserCourseInput>();
  for (const uc of userCourses) {
    courseStatusMap.set(uc.course_key, uc);
  }

  // ── 域冲突图 ──
  const reqsByDomain = new Map<number, string[]>();
  const domainsByReq = new Map<string, number[]>();
  for (const dm of domainMemberships) {
    pushUnique(reqsByDomain, dm.domain_id, dm.requirement_id);
    pushUnique(domainsByReq, dm.requirement_id, dm.domain_id);
  }

  // ── Phase 1: 自底向上 fulfillment ──
  for (const req of requirements) {
    if (req.rootNode) {
      bottomUpFulfillment(req.rootNode, courseStatusMap);
    }
  }

  // ── Phase 2: 自顶向下 activation ──
  const activeNodeIds = new Set<string>();
  for (const req of requirements) {
    if (req.rootNode) {
      topDownActivation(req.rootNode, true, activeNodeIds);
    }
  }

  // ── Phase 3: 收集 COURSE_SET 信息 ──
  const courseSetInfos: CourseSetInfo[] = [];
  for (const req of requirements) {
    if (req.rootNode) {
      collectCourseSets(
        req.rootNode,
        req.info.id,
        activeNodeIds,
        courseSetInfos,
      );
    }
  }

  // ── Phase 4A: 课程分配（按 COURSE_SET 自身 cap） ──
  const applyState = applyCourses(
    courseSetInfos,
    courseStatusMap,
    domainsByReq,
  );

  // ── Phase 4B: 补充分配（满足父级 SELECT 的 required_units_count） ──
  for (const req of requirements) {
    if (req.rootNode) {
      satisfySelectUnits(
        req.rootNode,
        req.info.id,
        courseStatusMap,
        applyState.courseApplied,
        applyState.courseUnapplied,
        applyState.nodeAppliedCourses,
        applyState.nodeAppliedCredits,
        domainsByReq,
        applyState.courseDomainBinding,
      );
    }
  }

  // ── Phase 5A: 填充 COURSE_SET summary ──
  for (const csInfo of courseSetInfos) {
    fillNodeSummary(csInfo, courseStatusMap, applyState.courseApplied);
  }

  // ── Phase 5B: 填充 SELECT summary ──
  for (const req of requirements) {
    if (req.rootNode) {
      fillSelectSummaries(
        req.rootNode,
        req.info.id,
        courseStatusMap,
        applyState.courseApplied,
      );
    }
  }

  // ── Phase 6: Writeback diff ──
  const { toInsert, toDelete } = computeWritebackDiff(
    userCourses,
    applyState.courseApplied,
  );

  // ── Phase 7: Program 级别汇总 ──
  let programFulfilled = true;
  let requiredCoursesCount = 0;
  let requiredCreditsCount = 0;
  for (const req of requirements) {
    if (req.rootNode) {
      if (!req.rootNode._fulfilled) {
        programFulfilled = false;
      }
      const reqCounts = computeRequiredUnits(req.rootNode);
      requiredCoursesCount += reqCounts.courses;
      requiredCreditsCount += reqCounts.credits;
    }
  }

  // 统计已完成且 applied 的课程数和学分数（按维度分别去重）
  const completedCourseKeys = new Set<string>(); // COURSE 维度
  const completedCreditKeys = new Set<string>(); // CREDIT 维度（去重用）
  let completedCreditsCount = 0;
  for (const csInfo of courseSetInfos) {
    if (!csInfo.isActive) continue;
    for (const ck of csInfo.courseKeys) {
      const uc = courseStatusMap.get(ck);
      if (
        uc?.status === 'COMPLETED' &&
        (applyState.courseApplied.get(ck) ?? []).includes(csInfo.requirementId)
      ) {
        if (csInfo.rule.units_type === 'COURSE') {
          completedCourseKeys.add(ck);
        } else if (!completedCreditKeys.has(ck)) {
          completedCreditKeys.add(ck);
          completedCreditsCount += uc.credits_received ?? 0;
        }
      }
    }
  }

  return {
    courseApplied: applyState.courseApplied,
    courseUnapplied: applyState.courseUnapplied,
    toInsert,
    toDelete,
    programFulfilled,
    completedCoursesCount: completedCourseKeys.size,
    requiredCoursesCount,
    completedCreditsCount,
    requiredCreditsCount,
  };
}

/**
 * 递归计算一个节点的 "effective" required 课程数和学分数。
 *
 * 规则：
 * - COURSE_SET: 按 units_type 分别计入 courses 或 credits
 * - SELECT:
 *   - 如果有 required_units_count，以它为主（优先级高于子节点之和）
 *   - 否则，取 required_children_count 个 fulfilled 子节点的贡献之和
 *     （如果也没有 required_children_count，则取所有子节点之和）
 */
function computeRequiredUnits(node: any): { courses: number; credits: number } {
  if (node.type === 'COURSE_SET') {
    const rule = node.rule as { required_units_count: number; units_type: 'COURSE' | 'CREDIT' };
    if (rule.units_type === 'CREDIT') {
      return { courses: 0, credits: rule.required_units_count };
    }
    return { courses: rule.required_units_count, credits: 0 };
  }

  if (node.type === 'SELECT') {
    const rule = node.rule as {
      required_children_count?: number;
      required_units_count?: number;
      units_type?: 'COURSE' | 'CREDIT';
    };

    // 如果 SELECT 自己有 required_units_count，以它为主
    if (rule.required_units_count !== undefined) {
      if (rule.units_type === 'CREDIT') {
        return { courses: 0, credits: rule.required_units_count };
      }
      return { courses: rule.required_units_count, credits: 0 };
    }

    // 否则，取子节点贡献之和
    const childCounts = (node.children as any[]).map((c: any) => computeRequiredUnits(c));

    if (rule.required_children_count !== undefined) {
      // 取 required_children_count 个贡献最大的子节点
      childCounts.sort((a, b) => (b.courses + b.credits) - (a.courses + a.credits));
      const selected = childCounts.slice(0, rule.required_children_count);
      return {
        courses: selected.reduce((s, c) => s + c.courses, 0),
        credits: selected.reduce((s, c) => s + c.credits, 0),
      };
    }

    // 都没有，取所有子节点之和
    return {
      courses: childCounts.reduce((s, c) => s + c.courses, 0),
      credits: childCounts.reduce((s, c) => s + c.credits, 0),
    };
  }

  return { courses: 0, credits: 0 };
}

// ── Phase 1: 自底向上 fulfillment ──

function bottomUpFulfillment(
  node: any,
  courseStatusMap: Map<string, UserCourseInput>,
): { fulfilled: boolean; completedCourses: number; completedCredits: number } {
  if (node.type === 'COURSE_SET') {
    let completedCourses = 0;
    let completedCredits = 0;
    for (const ck of node.requiredCourseIds) {
      const uc = courseStatusMap.get(ck);
      if (uc && uc.status === 'COMPLETED') {
        completedCourses++;
        completedCredits += uc.credits_received ?? 0;
      }
    }

    const rule = node.rule;
    if (rule.units_type === 'CREDIT') {
      node._fulfilled = completedCredits >= rule.required_units_count;
    } else {
      node._fulfilled = completedCourses >= rule.required_units_count;
    }

    return { fulfilled: node._fulfilled, completedCourses, completedCredits };
  }

  if (node.type === 'SELECT') {
    const fulfilledChildIds: string[] = [];
    let totalCourses = 0;
    let totalCredits = 0;

    for (const child of node.children) {
      const childResult = bottomUpFulfillment(child, courseStatusMap);
      totalCourses += childResult.completedCourses;
      totalCredits += childResult.completedCredits;
      if (childResult.fulfilled) {
        fulfilledChildIds.push(child.id);
      }
    }

    const rule = node.rule;
    let fulfilled = true;

    // 检查 required_children_count
    if (rule.required_children_count !== undefined) {
      if (fulfilledChildIds.length < rule.required_children_count) {
        fulfilled = false;
      }
      node.fulfilledChildIds = fulfilledChildIds.slice(
        0,
        rule.required_children_count,
      );
    } else {
      node.fulfilledChildIds = fulfilledChildIds;
    }

    // 检查 required_units_count
    if (rule.required_units_count !== undefined) {
      const units =
        rule.units_type === 'CREDIT' ? totalCredits : totalCourses;
      if (units < rule.required_units_count) {
        fulfilled = false;
      }
    }

    node._fulfilled = fulfilled;

    return {
      fulfilled,
      completedCourses: totalCourses,
      completedCredits: totalCredits,
    };
  }

  return { fulfilled: false, completedCourses: 0, completedCredits: 0 };
}

// ── Phase 2: 自顶向下 activation ──

function topDownActivation(
  node: any,
  isActive: boolean,
  activeNodeIds: Set<string>,
): void {
  if (node.type === 'COURSE_SET') {
    if (isActive) activeNodeIds.add(node.id);
    return;
  }

  if (node.type === 'SELECT') {
    const hasUnitsReq = node.rule.required_units_count !== undefined;

    for (const child of node.children) {
      let childActive: boolean;

      if (hasUnitsReq) {
        // SELECT 有 required_units_count 时，所有 children 都 active，
        // 因为任何子节点的课程都可能需要被 apply 来满足总 units
        childActive = isActive;
      } else {
        // 旧逻辑：fulfilled 的 SELECT → 只有被选中的 children active
        // 未 fulfilled 的 SELECT → 所有 children active
        childActive =
          isActive &&
          (!node._fulfilled || node.fulfilledChildIds.includes(child.id));
      }

      topDownActivation(child, childActive, activeNodeIds);
    }
  }
}

// ── Phase 3: 收集 COURSE_SET 信息 ──

function collectCourseSets(
  node: any,
  requirementId: string,
  activeNodeIds: Set<string>,
  result: CourseSetInfo[],
): void {
  if (node.type === 'COURSE_SET') {
    result.push({
      nodeId: node.id,
      requirementId,
      rule: node.rule,
      courseKeys: [...node.requiredCourseIds],
      isActive: activeNodeIds.has(node.id),
      node,
    });
    return;
  }
  if (node.type === 'SELECT') {
    for (const child of node.children) {
      collectCourseSets(child, requirementId, activeNodeIds, result);
    }
  }
}

// ── Phase 4A: 课程分配（按 COURSE_SET 自身 cap） ──

function applyCourses(
  courseSetInfos: CourseSetInfo[],
  courseStatusMap: Map<string, UserCourseInput>,
  domainsByReq: Map<string, number[]>,
): {
  courseApplied: Map<string, string[]>;
  courseUnapplied: Map<string, UnappliesToEntry[]>;
  nodeAppliedCourses: Map<string, number>;
  nodeAppliedCredits: Map<string, number>;
  courseDomainBinding: Map<string, Map<number, string>>;
} {
  const courseApplied = new Map<string, string[]>();
  const courseUnapplied = new Map<string, UnappliesToEntry[]>();

  // 每个节点已 apply 的课程数量和学分数
  const nodeAppliedCourses = new Map<string, number>();
  const nodeAppliedCredits = new Map<string, number>();
  for (const cs of courseSetInfos) {
    nodeAppliedCourses.set(cs.nodeId, 0);
    nodeAppliedCredits.set(cs.nodeId, 0);
  }

  // courseKey → { domainId → appliedRequirementId }
  const courseDomainBinding = new Map<string, Map<number, string>>();

  // courseKey → [所在的 CourseSetInfo]
  const courseCandidates = new Map<string, CourseSetInfo[]>();
  for (const cs of courseSetInfos) {
    for (const ck of cs.courseKeys) {
      const list = courseCandidates.get(ck) ?? [];
      list.push(cs);
      courseCandidates.set(ck, list);
    }
  }

  // ── 尝试 apply 一门课到一个 COURSE_SET ──
  function tryApply(
    ck: string,
    csInfo: CourseSetInfo,
  ): { applied: boolean; reason?: string; blockedBy?: string } {
    if (!csInfo.isActive) {
      return { applied: false, reason: 'INACTIVE' };
    }

    // COURSE_SET 自身 cap 检查
    if (csInfo.rule.units_type === 'CREDIT') {
      const currentCredits = nodeAppliedCredits.get(csInfo.nodeId) ?? 0;
      if (currentCredits >= csInfo.rule.required_units_count) {
        return { applied: false, reason: 'OVERLIMIT' };
      }
    } else {
      const currentCount = nodeAppliedCourses.get(csInfo.nodeId) ?? 0;
      if (currentCount >= csInfo.rule.required_units_count) {
        return { applied: false, reason: 'OVERLIMIT' };
      }
    }

    // 检查域冲突
    const reqDomains = domainsByReq.get(csInfo.requirementId) ?? [];
    const bindings =
      courseDomainBinding.get(ck) ?? new Map<number, string>();
    for (const domainId of reqDomains) {
      const existingReq = bindings.get(domainId);
      if (existingReq && existingReq !== csInfo.requirementId) {
        return { applied: false, reason: 'CONFLICT', blockedBy: existingReq };
      }
    }

    // Apply 成功
    const uc = courseStatusMap.get(ck);
    const credits = uc?.credits_received ?? 0;

    nodeAppliedCourses.set(
      csInfo.nodeId,
      (nodeAppliedCourses.get(csInfo.nodeId) ?? 0) + 1,
    );
    nodeAppliedCredits.set(
      csInfo.nodeId,
      (nodeAppliedCredits.get(csInfo.nodeId) ?? 0) + credits,
    );

    const applies = courseApplied.get(ck) ?? [];
    applies.push(csInfo.requirementId);
    courseApplied.set(ck, applies);

    for (const domainId of reqDomains) {
      bindings.set(domainId, csInfo.requirementId);
    }
    courseDomainBinding.set(ck, bindings);

    return { applied: true };
  }

  // ── 记录 unapply ──
  function recordUnapply(
    ck: string,
    requirementId: string,
    reason: string,
    blockedBy?: string,
  ) {
    const list = courseUnapplied.get(ck) ?? [];
    list.push({
      requirementId: requirementId,
      reason: reason as UnappliesToEntry['reason'],
      blockedByRequirementId: blockedBy ?? '',
    });
    courseUnapplied.set(ck, list);
  }

  // ── Step A: 锁定已有合法绑定 ──
  const coursesWithBindings: UserCourseInput[] = [];
  for (const uc of courseStatusMap.values()) {
    if (uc.existing_requirement_ids.length > 0) {
      coursesWithBindings.push(uc);
    }
  }
  coursesWithBindings.sort(
    (a, b) =>
      STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || a.id - b.id,
  );

  for (const uc of coursesWithBindings) {
    for (const reqId of uc.existing_requirement_ids) {
      const candidates = courseCandidates.get(uc.course_key) ?? [];
      const csInfo = candidates.find((c) => c.requirementId === reqId);
      if (!csInfo) continue;

      tryApply(uc.course_key, csInfo);
    }
  }

  // ── Step B: 处理所有课程 ──
  const allCourses = [...courseStatusMap.values()].sort(
    (a, b) =>
      STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || a.id - b.id,
  );

  for (const uc of allCourses) {
    const candidates = courseCandidates.get(uc.course_key) ?? [];

    for (const csInfo of candidates) {
      // 跳过已 apply 的
      const alreadyApplied = courseApplied.get(uc.course_key) ?? [];
      if (alreadyApplied.includes(csInfo.requirementId)) continue;

      const result = tryApply(uc.course_key, csInfo);
      if (!result.applied) {
        recordUnapply(
          uc.course_key,
          csInfo.requirementId,
          result.reason!,
          result.blockedBy,
        );
      }
    }
  }

  return {
    courseApplied,
    courseUnapplied,
    nodeAppliedCourses,
    nodeAppliedCredits,
    courseDomainBinding,
  };
}

// ── Phase 4B: 补充分配（满足父级 SELECT 的 required_units_count） ──

/**
 * 递归遍历树，对每个有 required_units_count 的 SELECT 节点，
 * 如果当前 applied 的 units 不足，从后代 COURSE_SET 中找到
 * 因 OVERLIMIT 而未被 apply 的课程，补充 apply 上去。
 */
function satisfySelectUnits(
  node: any,
  requirementId: string,
  courseStatusMap: Map<string, UserCourseInput>,
  courseApplied: Map<string, string[]>,
  courseUnapplied: Map<string, UnappliesToEntry[]>,
  nodeAppliedCourses: Map<string, number>,
  nodeAppliedCredits: Map<string, number>,
  domainsByReq: Map<string, number[]>,
  courseDomainBinding: Map<string, Map<number, string>>,
): void {
  if (node.type !== 'SELECT') return;

  // 先递归子节点（bottom-up 处理嵌套 SELECT）
  for (const child of node.children) {
    satisfySelectUnits(
      child,
      requirementId,
      courseStatusMap,
      courseApplied,
      courseUnapplied,
      nodeAppliedCourses,
      nodeAppliedCredits,
      domainsByReq,
      courseDomainBinding,
    );
  }

  const rule = node.rule;
  if (rule.required_units_count === undefined) return;

  const unitsType: 'COURSE' | 'CREDIT' = rule.units_type ?? 'COURSE';

  // 计算当前 applied 的 units，并收集可额外 apply 的候选课程
  let currentUnits = 0;
  const extraCandidates: {
    ck: string;
    credits: number;
    nodeId: string;
  }[] = [];

  collectUnitsAndCandidates(
    node,
    requirementId,
    courseStatusMap,
    courseApplied,
    unitsType,
    (units) => {
      currentUnits += units;
    },
    (ck, credits, nodeId) => {
      extraCandidates.push({ ck, credits, nodeId });
    },
  );

  if (currentUnits >= rule.required_units_count) return;

  // 按优先级排序（COMPLETED > IN_PROGRESS > PLANNED > SAVED）
  extraCandidates.sort((a, b) => {
    const ucA = courseStatusMap.get(a.ck)!;
    const ucB = courseStatusMap.get(b.ck)!;
    return (
      STATUS_PRIORITY[ucA.status] - STATUS_PRIORITY[ucB.status] ||
      ucA.id - ucB.id
    );
  });

  // 逐个补充 apply 直到满足
  for (const candidate of extraCandidates) {
    if (currentUnits >= rule.required_units_count) break;

    // 域冲突检查
    const reqDomains = domainsByReq.get(requirementId) ?? [];
    const bindings =
      courseDomainBinding.get(candidate.ck) ?? new Map<number, string>();
    let blocked = false;
    for (const domainId of reqDomains) {
      const existingReq = bindings.get(domainId);
      if (existingReq && existingReq !== requirementId) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // 检查是否已 apply 到此 requirement
    const applied = courseApplied.get(candidate.ck) ?? [];
    if (applied.includes(requirementId)) continue;

    // Apply
    applied.push(requirementId);
    courseApplied.set(candidate.ck, applied);

    const uc = courseStatusMap.get(candidate.ck)!;
    const credits = uc.credits_received ?? 0;

    nodeAppliedCourses.set(
      candidate.nodeId,
      (nodeAppliedCourses.get(candidate.nodeId) ?? 0) + 1,
    );
    nodeAppliedCredits.set(
      candidate.nodeId,
      (nodeAppliedCredits.get(candidate.nodeId) ?? 0) + credits,
    );

    for (const domainId of reqDomains) {
      bindings.set(domainId, requirementId);
    }
    courseDomainBinding.set(candidate.ck, bindings);

    // 移除 OVERLIMIT unapply 记录
    const unapplied = courseUnapplied.get(candidate.ck);
    if (unapplied) {
      const idx = unapplied.findIndex(
        (u) =>
          u.requirementId === requirementId && u.reason === 'OVERLIMIT',
      );
      if (idx >= 0) unapplied.splice(idx, 1);
      if (unapplied.length === 0) courseUnapplied.delete(candidate.ck);
    }

    if (unitsType === 'COURSE') {
      currentUnits += 1;
    } else {
      currentUnits += credits;
    }
  }
}

/**
 * 递归遍历后代 COURSE_SET，统计已 applied 的 units，
 * 同时收集未被 apply（可作为额外候选）的课程。
 */
function collectUnitsAndCandidates(
  node: any,
  requirementId: string,
  courseStatusMap: Map<string, UserCourseInput>,
  courseApplied: Map<string, string[]>,
  unitsType: 'COURSE' | 'CREDIT',
  addUnits: (units: number) => void,
  addCandidate: (ck: string, credits: number, nodeId: string) => void,
): void {
  if (node.type === 'COURSE_SET') {
    for (const ck of node.requiredCourseIds) {
      const uc = courseStatusMap.get(ck);
      if (!uc) continue;

      const applied = (courseApplied.get(ck) ?? []).includes(requirementId);
      if (applied) {
        addUnits(unitsType === 'COURSE' ? 1 : (uc.credits_received ?? 0));
      } else {
        // 候选：用户有此课但尚未 apply 到这个 requirement
        addCandidate(ck, uc.credits_received ?? 0, node.id);
      }
    }
    return;
  }

  if (node.type === 'SELECT') {
    for (const child of node.children) {
      collectUnitsAndCandidates(
        child,
        requirementId,
        courseStatusMap,
        courseApplied,
        unitsType,
        addUnits,
        addCandidate,
      );
    }
  }
}

// ── Phase 5: 填充 COURSE_SET summary ──

function fillNodeSummary(
  csInfo: CourseSetInfo,
  courseStatusMap: Map<string, UserCourseInput>,
  courseApplied: Map<string, string[]>,
): void {
  const summary = csInfo.node.summary;
  summary.isFulfilled = !!csInfo.node._fulfilled;

  let appliedUnits = 0;

  for (const ck of csInfo.courseKeys) {
    const uc = courseStatusMap.get(ck);
    if (!uc) continue;

    const appliedReqs = courseApplied.get(ck) ?? [];
    const isApplied = appliedReqs.includes(csInfo.requirementId);

    if (isApplied) {
      appliedUnits +=
        csInfo.rule.units_type === 'COURSE' ? 1 : (uc.credits_received ?? 0);
    }

    switch (uc.status) {
      case 'COMPLETED':
        if (isApplied) summary.completedAppliedCourseIds.push(ck);
        else summary.completedUnappliedCourseIds.push(ck);
        break;
      case 'IN_PROGRESS':
        if (isApplied) summary.inProgressAppliedCourseIds.push(ck);
        else summary.inProgressUnappliedCourseIds.push(ck);
        break;
      case 'PLANNED':
        if (isApplied) summary.plannedAppliedCourseIds.push(ck);
        else summary.plannedUnappliedCourseIds.push(ck);
        break;
      case 'SAVED':
        if (isApplied) summary.savedAppliedCourseIds.push(ck);
        else summary.savedUnappliedCourseIds.push(ck);
        break;
    }
  }

  summary.appliedUnitsCount = appliedUnits;
}

// ── Phase 5B: 填充 SELECT summary ──

function fillSelectSummaries(
  node: any,
  requirementId: string,
  courseStatusMap: Map<string, UserCourseInput>,
  courseApplied: Map<string, string[]>,
): void {
  if (node.type === 'SELECT') {
    // 先递归处理子节点
    for (const child of node.children) {
      fillSelectSummaries(child, requirementId, courseStatusMap, courseApplied);
    }

    // 计算 applied_units_count：遍历所有后代 COURSE_SET 的 applied 课程
    const rule = node.rule as { required_units_count?: number; units_type?: 'COURSE' | 'CREDIT' };
    const unitsType = rule.units_type ?? 'COURSE';
    let appliedUnits = 0;
    collectAppliedUnits(node, requirementId, courseStatusMap, courseApplied, unitsType, (u) => { appliedUnits += u; });

    node.summary.isFulfilled = !!node._fulfilled;
    node.summary.appliedUnitsCount = appliedUnits;
  }
}

/**
 * 递归遍历后代 COURSE_SET，统计 applied 课程的 units 总和。
 */
function collectAppliedUnits(
  node: any,
  requirementId: string,
  courseStatusMap: Map<string, UserCourseInput>,
  courseApplied: Map<string, string[]>,
  unitsType: 'COURSE' | 'CREDIT',
  addUnits: (units: number) => void,
): void {
  if (node.type === 'COURSE_SET') {
    for (const ck of node.requiredCourseIds) {
      const uc = courseStatusMap.get(ck);
      if (!uc) continue;
      const applied = (courseApplied.get(ck) ?? []).includes(requirementId);
      if (applied) {
        addUnits(unitsType === 'COURSE' ? 1 : (uc.credits_received ?? 0));
      }
    }
    return;
  }

  if (node.type === 'SELECT') {
    for (const child of node.children) {
      collectAppliedUnits(child, requirementId, courseStatusMap, courseApplied, unitsType, addUnits);
    }
  }
}

// ── Phase 6: Writeback diff ──

function computeWritebackDiff(
  userCourses: UserCourseInput[],
  courseApplied: Map<string, string[]>,
): {
  toInsert: { user_course_id: number; requirement_id: string }[];
  toDelete: { user_course_id: number; requirement_id: string }[];
} {
  const toInsert: { user_course_id: number; requirement_id: string }[] = [];
  const toDelete: { user_course_id: number; requirement_id: string }[] = [];

  for (const uc of userCourses) {
    const appliedReqs = new Set(courseApplied.get(uc.course_key) ?? []);
    const existingReqs = new Set(uc.existing_requirement_ids);

    for (const reqId of appliedReqs) {
      if (!existingReqs.has(reqId)) {
        toInsert.push({ user_course_id: uc.id, requirement_id: reqId });
      }
    }

    for (const reqId of existingReqs) {
      if (!appliedReqs.has(reqId)) {
        toDelete.push({ user_course_id: uc.id, requirement_id: reqId });
      }
    }
  }

  return { toInsert, toDelete };
}

// ── 工具函数 ──

function pushUnique<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key) ?? [];
  if (!arr.includes(value)) arr.push(value);
  map.set(key, arr);
}
