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
  pick_count: number;
  child_node_ids: string[]; // 已按 position 排序
  courses: { course_id: string; topic: string }[];
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

export interface RequirementInfo {
  id: string;
  name: string;
  description: string[];
  program_id: string;
  concentration_name: string | null;
  ui_type: 'GROUP' | 'LIST';
}

const EMPTY_SUMMARY = {
  is_fulfilled: false,
  completed_course_ids: [] as string[],
  completed_not_used_course_ids: [] as string[],
  in_progress_course_ids: [] as string[],
  in_progress_not_used_course_ids: [] as string[],
  planned_course_ids: [] as string[],
  planned_not_used_course_ids: [] as string[],
  saved_course_ids: [] as string[],
  saved_not_used_course_ids: [] as string[],
};

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

  // 收集所有课程条目（去重）
  const courseEntryMap = new Map<string, CourseEntry>();

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
      ? buildNode(req.root_node_id, nodeMap, courseEntryMap)
      : null;

    return { info, root_node };
  });

  return {
    requirements: result,
    courseEntries: Array.from(courseEntryMap.values()),
  };
}

// ── 递归构建节点 ──

function buildNode(
  nodeId: string,
  nodeMap: Map<string, NodeInput>,
  courseEntryMap: Map<string, CourseEntry>,
): any {
  const node = nodeMap.get(nodeId);
  if (!node) return null;

  const base = {
    id: node.id,
    type: node.type,
    title: node.title ?? '',
    pick_count: node.pick_count,
  };

  if (node.type === 'SELECT') {
    const children = node.child_node_ids
      .map((id) => buildNode(id, nodeMap, courseEntryMap))
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
      courseEntryMap.set(key, { course_id: nc.course_id, topic: nc.topic });
      return key;
    });

    return {
      ...base,
      required_course_ids,
      summary: { ...EMPTY_SUMMARY },
    };
  }

  // 未知类型，返回基础信息
  return base;
}
