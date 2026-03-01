/**
 * 纯函数：计算 fulfillment 状态。
 *
 * 算法流程：
 *   Phase 1 — 自底向上：判断每个节点是否 fulfilled（仅 COMPLETED 计数）
 *   Phase 2 — 自顶向下：决定哪些 COURSE_SET 节点是 active
 *   Phase 3 — 课程分配：尊重已有绑定 → 按优先级填充剩余
 *   Phase 4 — 填充 summary：写入每个 COURSE_SET 的 applied/unapplied 列表
 *   Phase 5 — 计算 writeback diff 和 program-level 汇总
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
  requirement_id: string;
  reason: 'OVERLIMIT' | 'CONFLICT' | 'INACTIVE';
  blocked_by_requirement_id: string;
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
}

// ── 内部类型 ──

interface CourseSetInfo {
  nodeId: string;
  requirementId: string;
  pickCount: number;
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
  requirements: { info: { id: string }; root_node: any }[],
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
    if (req.root_node) {
      bottomUpFulfillment(req.root_node, courseStatusMap);
    }
  }

  // ── Phase 2: 自顶向下 activation ──
  const activeNodeIds = new Set<string>();
  for (const req of requirements) {
    if (req.root_node) {
      topDownActivation(req.root_node, true, activeNodeIds);
    }
  }

  // ── Phase 3: 收集 COURSE_SET 信息 ──
  const courseSetInfos: CourseSetInfo[] = [];
  for (const req of requirements) {
    if (req.root_node) {
      collectCourseSets(
        req.root_node,
        req.info.id,
        activeNodeIds,
        courseSetInfos,
      );
    }
  }

  // ── Phase 4: 课程分配 ──
  const applyResult = applyCourses(
    courseSetInfos,
    courseStatusMap,
    domainsByReq,
  );

  // ── Phase 5: 填充 COURSE_SET summary ──
  for (const csInfo of courseSetInfos) {
    fillNodeSummary(csInfo, courseStatusMap, applyResult.courseApplied);
  }

  // ── Phase 6: Writeback diff ──
  const { toInsert, toDelete } = computeWritebackDiff(
    userCourses,
    applyResult.courseApplied,
  );

  // ── Phase 7: Program 级别汇总 ──
  let programFulfilled = true;
  let requiredCoursesCount = 0;
  for (const req of requirements) {
    if (req.root_node && !req.root_node._fulfilled) {
      programFulfilled = false;
    }
  }

  const completedApplied = new Set<string>();
  for (const csInfo of courseSetInfos) {
    if (csInfo.isActive) {
      requiredCoursesCount += csInfo.pickCount;
    }
    const applied = applyResult.courseApplied;
    for (const ck of csInfo.courseKeys) {
      const uc = courseStatusMap.get(ck);
      if (
        uc?.status === 'COMPLETED' &&
        (applied.get(ck) ?? []).includes(csInfo.requirementId)
      ) {
        completedApplied.add(ck);
      }
    }
  }

  return {
    courseApplied: applyResult.courseApplied,
    courseUnapplied: applyResult.courseUnapplied,
    toInsert,
    toDelete,
    programFulfilled,
    completedCoursesCount: completedApplied.size,
    requiredCoursesCount,
  };
}

// ── Phase 1: 自底向上 fulfillment ──

function bottomUpFulfillment(
  node: any,
  courseStatusMap: Map<string, UserCourseInput>,
): boolean {
  if (node.type === 'COURSE_SET') {
    let completedCount = 0;
    for (const ck of node.required_course_ids) {
      const uc = courseStatusMap.get(ck);
      if (uc && uc.status === 'COMPLETED') completedCount++;
    }
    node._fulfilled = completedCount >= node.pick_count;
    return node._fulfilled;
  }

  if (node.type === 'SELECT') {
    const fulfilledChildIds: string[] = [];
    for (const child of node.children) {
      if (bottomUpFulfillment(child, courseStatusMap)) {
        fulfilledChildIds.push(child.id);
      }
    }
    // 按树中的顺序，取前 pick_count 个 fulfilled 子节点
    node.fulfilled_child_ids = fulfilledChildIds.slice(0, node.pick_count);
    node._fulfilled = fulfilledChildIds.length >= node.pick_count;
    return node._fulfilled;
  }

  return false;
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
    for (const child of node.children) {
      // 已 fulfilled 的 SELECT → 只有被选中的 children active
      // 未 fulfilled 的 SELECT → 所有 children active
      const childActive =
        isActive &&
        (!node._fulfilled || node.fulfilled_child_ids.includes(child.id));
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
      pickCount: node.pick_count,
      courseKeys: [...node.required_course_ids],
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

// ── Phase 4: 课程分配 ──

function applyCourses(
  courseSetInfos: CourseSetInfo[],
  courseStatusMap: Map<string, UserCourseInput>,
  domainsByReq: Map<string, number[]>,
): {
  courseApplied: Map<string, string[]>;
  courseUnapplied: Map<string, UnappliesToEntry[]>;
} {
  const courseApplied = new Map<string, string[]>();
  const courseUnapplied = new Map<string, UnappliesToEntry[]>();

  // 每个节点已 apply 的数量
  const nodeAppliedCount = new Map<string, number>();
  for (const cs of courseSetInfos) {
    nodeAppliedCount.set(cs.nodeId, 0);
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

    const currentCount = nodeAppliedCount.get(csInfo.nodeId) ?? 0;
    if (currentCount >= csInfo.pickCount) {
      return { applied: false, reason: 'OVERLIMIT' };
    }

    // 检查域冲突
    const reqDomains = domainsByReq.get(csInfo.requirementId) ?? [];
    const bindings = courseDomainBinding.get(ck) ?? new Map<number, string>();
    for (const domainId of reqDomains) {
      const existingReq = bindings.get(domainId);
      if (existingReq && existingReq !== csInfo.requirementId) {
        return { applied: false, reason: 'CONFLICT', blockedBy: existingReq };
      }
    }

    // Apply 成功
    nodeAppliedCount.set(csInfo.nodeId, currentCount + 1);

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
      requirement_id: requirementId,
      reason: reason as UnappliesToEntry['reason'],
      blocked_by_requirement_id: blockedBy ?? '',
    });
    courseUnapplied.set(ck, list);
  }

  // ── Step A: 锁定已有合法绑定 ──
  // 收集所有有已有绑定的课程，按优先级排序
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
      if (!csInfo) continue; // 课已不在该 requirement 的 COURSE_SET 中

      tryApply(uc.course_key, csInfo);
      // 若失败，Step B 会处理 unapply
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

  return { courseApplied, courseUnapplied };
}

// ── Phase 5: 填充 COURSE_SET summary ──

function fillNodeSummary(
  csInfo: CourseSetInfo,
  courseStatusMap: Map<string, UserCourseInput>,
  courseApplied: Map<string, string[]>,
): void {
  const summary = csInfo.node.summary;
  summary.is_fulfilled = !!csInfo.node._fulfilled;

  for (const ck of csInfo.courseKeys) {
    const uc = courseStatusMap.get(ck);
    if (!uc) continue;

    const appliedReqs = courseApplied.get(ck) ?? [];
    const isApplied = appliedReqs.includes(csInfo.requirementId);

    const suffix = isApplied ? 'applied' : 'unapplied';
    switch (uc.status) {
      case 'COMPLETED':
        summary[`completed_${suffix}_course_ids`].push(ck);
        break;
      case 'IN_PROGRESS':
        summary[`in_progress_${suffix}_course_ids`].push(ck);
        break;
      case 'PLANNED':
        summary[`planned_${suffix}_course_ids`].push(ck);
        break;
      case 'SAVED':
        summary[`saved_${suffix}_course_ids`].push(ck);
        break;
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
