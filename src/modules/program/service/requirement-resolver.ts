/**
 * 纯函数：根据 program 的依赖标志和用户上下文，
 * 从 requirement_sets 中筛选出唯一匹配的 set，返回其 requirement IDs。
 *
 * 匹配规则（针对每个 dependent 维度）：
 *   - 如果 program 不依赖该维度 → 跳过，视为匹配
 *   - 如果 set 的值为 null → 只匹配「用户在该维度也没有值」的情况
 *   - 如果 set 的值非 null → 用户的值必须匹配
 *
 * 只会匹配到一个 set（数据保证互斥）。
 */

export interface ProgramFlags {
  year_dependent: boolean;
  major_dependent: boolean;
  college_dependent: boolean;
  concentration_dependent: boolean;
}

export interface UserContext {
  entry_year: string;
  college_id: string;
  major_ids: string[];
  concentration_names: string[];
}

export interface RequirementSetInput {
  id: number;
  applies_to_entry_year: string | null;
  applies_to_college_id: string | null;
  applies_to_major_id: string | null;
  applies_to_concentration_names: string[] | null;
  requirement_set_requirements: { requirement_id: string }[];
}

export function resolveRequirementIds(
  flags: ProgramFlags,
  sets: RequirementSetInput[],
  user: UserContext,
): string[] {
  const match = sets.find((set) => {
    // ── year ──
    if (flags.year_dependent) {
      if (set.applies_to_entry_year === null) return false;
      if (set.applies_to_entry_year !== user.entry_year) return false;
    }

    // ── college ──
    if (flags.college_dependent) {
      if (set.applies_to_college_id === null) return false;
      if (set.applies_to_college_id !== user.college_id) return false;
    }

    // ── major ──
    if (flags.major_dependent) {
      if (set.applies_to_major_id === null) {
        if (user.major_ids.length > 0) return false;
      } else {
        if (!user.major_ids.includes(set.applies_to_major_id)) return false;
      }
    }

    // ── concentration ──
    if (flags.concentration_dependent) {
      if (set.applies_to_concentration_names === null) {
        if (user.concentration_names.length > 0) return false;
      } else {
        if (
          !user.concentration_names.some((name) =>
            set.applies_to_concentration_names!.includes(name),
          )
        )
          return false;
      }
    }

    return true;
  });

  if (!match) return [];
  return match.requirement_set_requirements.map((r) => r.requirement_id);
}
