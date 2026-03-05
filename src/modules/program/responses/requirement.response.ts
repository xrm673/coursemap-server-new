export interface Requirement {
    info: RequirementInfo;
    root_node: Select | CourseSet;
}

interface RequirementInfo {
    id: string;
    name: string;
    description: string[];
    program_id: string;
    concentration_name: string;
    ui_type: "GROUP" | "LIST";
}

interface SelectRule {
    required_children_count?: number;
    required_units_count?: number;
    units_type?: "COURSE" | "CREDIT";
}

interface CourseSetRule {
    required_units_count: number;
    units_type: "COURSE" | "CREDIT";
}

interface NodeBase {
    id: string;
    type: "SELECT" | "COURSE_SET";
    title: string;
    rule: SelectRule | CourseSetRule;
}

interface Select extends NodeBase {
    type: "SELECT";
    children: (Select | CourseSet)[];
    fulfilled_child_ids: string[];
}

interface CourseSet extends NodeBase {
    type: "COURSE_SET";
    required_course_ids: string[];
    summary: CourseSetSummary;
}

interface CourseSetSummary {
    is_fulfilled: boolean;
    
    completed_applied_course_ids: string[];
    completed_unapplied_course_ids: string[];
    
    in_progress_applied_course_ids: string[];
    in_progress_unapplied_course_ids: string[];
    
    planned_applied_course_ids: string[];
    planned_unapplied_course_ids: string[];
    
    saved_applied_course_ids: string[];
    saved_unapplied_course_ids: string[];
}
