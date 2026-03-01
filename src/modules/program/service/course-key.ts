/**
 * 生成 CourseOption 字典的 key。
 *   - topic 为空 → course_id        （如 "CS4780"）
 *   - topic 非空 → course_id::topic  （如 "ORIE5380::Bayesian Statistics"）
 */
export function courseKey(courseId: string, topic: string): string {
  return topic ? `${courseId}::${topic}` : courseId;
}
