/**
 * 纯函数：将 requirements + nodes 原始数据组装成 Requirement 树结构。
 * 不依赖数据库，方便测试。
 */

import { courseKey } from './course-key';

// ── 输入类型（由调用方从 Prisma 数据映射而来） ──

export interface RequirementInput {
  id: string;
  name: string;
  ui_type: string;
  description: unknown; // Json — 预期为 string[] | null
  concentration_id: number | null;
  root_node_id: string | null;
  program_id: string;
}

export interface NodeInput {
  id: string;
  type: string;
  title: string | null;
  rule: unknown; // Json — SELECT 或 COURSE_SET 的规则对象
  child_node_ids: string[]; // 已按 position 排序
  courses: {
    course_id: string;
    topic: string;
    requirement_id: string;
    combined_group_id: number | null;
  }[];
}

export interface ConcentrationInput {
  id: number;
  concentration_name: string;
}

// ── 输出类型 ──

export interface CourseEntry {
  course_id: string;
  topic: string;
}

/** 每门课在 requirement 树中的额外元信息 */
export interface CourseMeta {
  requirement_ids: string[];
  combined_group_id: number | null;
}

export interface RequirementInfo {
  id: string;
  name: string;
  description: string[];
  program_id: string;
  concentration_name: string | null;
  ui_type: 'GROUP' | 'LIST';
}

function createEmptySummary() {
  return {
    is_fulfilled: false,
    completed_applied_course_ids: [] as string[],
    completed_unapplied_course_ids: [] as string[],
    in_progress_applied_course_ids: [] as string[],
    in_progress_unapplied_course_ids: [] as string[],
    planned_applied_course_ids: [] as string[],
    planned_unapplied_course_ids: [] as string[],
    saved_applied_course_ids: [] as string[],
    saved_unapplied_course_ids: [] as string[],
  };
}

// ── 主函数 ──

export function buildRequirementTrees(
  requirements: RequirementInput[],
  nodes: NodeInput[],
  concentrations: ConcentrationInput[],
) {
  // 构建查找表
  const nodeMap = new Map<string, NodeInput>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const concentrationMap = new Map<number, string>();
  for (const c of concentrations) {
    concentrationMap.set(c.id, c.concentration_name);
  }

  // 收集所有课程条目（去重）+ 元信息
  const courseEntryMap = new Map<string, CourseEntry>();
  const courseMetaMap = new Map<string, CourseMeta>();

  // 为每个 requirement 构建树
  const result = requirements.map((req) => {
    const info: RequirementInfo = {
      id: req.id,
      name: req.name,
      description: Array.isArray(req.description) ? req.description : [],
      program_id: req.program_id,
      concentration_name: req.concentration_id
        ? concentrationMap.get(req.concentration_id) ?? null
        : null,
      ui_type: req.ui_type as 'GROUP' | 'LIST',
    };

    const root_node = req.root_node_id
      ? buildNode(req.root_node_id, nodeMap, courseEntryMap, courseMetaMap)
      : null;

    return { info, root_node };
  });

  return {
    requirements: result,
    courseEntries: Array.from(courseEntryMap.values()),
    courseMetaMap,
  };
}

// ── 递归构建节点 ──

function buildNode(
  nodeId: string,
  nodeMap: Map<string, NodeInput>,
  courseEntryMap: Map<string, CourseEntry>,
  courseMetaMap: Map<string, CourseMeta>,
): any {
  const node = nodeMap.get(nodeId);
  if (!node) return null;

  const base = {
    id: node.id,
    type: node.type,
    title: node.title ?? '',
    rule: node.rule,
  };

  if (node.type === 'SELECT') {
    const children = node.child_node_ids
      .map((id) => buildNode(id, nodeMap, courseEntryMap, courseMetaMap))
      .filter(Boolean);

    return {
      ...base,
      children,
      fulfilled_child_ids: [],
    };
  }

  if (node.type === 'COURSE_SET') {
    const required_course_ids = node.courses.map((nc) => {
      const key = courseKey(nc.course_id, nc.topic);

      // 收集课程条目
      courseEntryMap.set(key, { course_id: nc.course_id, topic: nc.topic });

      // 收集元信息（同一门课可能出现在多个 requirement 中）
      const existing = courseMetaMap.get(key);
      if (existing) {
        if (!existing.requirement_ids.includes(nc.requirement_id)) {
          existing.requirement_ids.push(nc.requirement_id);
        }
        // combined_group_id 取第一个非 null 的值
        if (existing.combined_group_id === null && nc.combined_group_id !== null) {
          existing.combined_group_id = nc.combined_group_id;
        }
      } else {
        courseMetaMap.set(key, {
          requirement_ids: [nc.requirement_id],
          combined_group_id: nc.combined_group_id,
        });
      }

      return key;
    });

    return {
      ...base,
      required_course_ids,
      summary: createEmptySummary(),
    };
  }

  // 未知类型，返回基础信息
  return base;
}
