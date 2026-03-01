/**
 * 学期格式: "WI26", "SP26", "SU26", "FA26"
 * 一年的顺序: WI < SP < SU < FA
 */

const SEASON_ORDER: Record<string, number> = {
  WI: 0,
  SP: 1,
  SU: 2,
  FA: 3,
};

/** 将学期字符串转为可比较的数值 */
function semesterValue(semester: string): number {
  const season = semester.slice(0, 2);
  const year = parseInt(semester.slice(2), 10);
  return year * 4 + (SEASON_ORDER[season] ?? 0);
}

/** 比较两个学期：负数表示 a 更早，正数表示 a 更晚，0 表示相等 */
export function compareSemesters(a: string, b: string): number {
  return semesterValue(a) - semesterValue(b);
}

/** 从一组学期中找到最晚的一个 */
export function latestSemester(semesters: string[]): string | null {
  if (semesters.length === 0) return null;
  return semesters.reduce((latest, s) =>
    compareSemesters(s, latest) > 0 ? s : latest,
  );
}
