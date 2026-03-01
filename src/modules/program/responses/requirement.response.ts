export class Requirement {
    info: RequirementInfo;
    root_node: Select | CourseSet;
}

class RequirementInfo {
    id: string;
    name: string;
    description: string[];
    program_id: string;
    concentration_name: string;
    ui_type: "GROUP" | "LIST";
}

class NodeBase {
    id: string;
    type: "SELECT" | "COURSE_SET";
    title: string;
    pick_count: number;
}

class Select extends NodeBase {
    type: "SELECT";
    children: Select[] | CourseSet[];
    fulfilled_child_ids: string[];
}

class CourseSet extends NodeBase {
    type: "COURSE_SET";
    required_course_ids: string[];
    summary: CourseSetSummary;
}

class CourseSetSummary {
    is_fulfilled: boolean;
    
    completed_course_ids: string[];
    completed_not_used_course_ids: string[];
    
    in_progress_course_ids: string[];
    in_progress_not_used_course_ids: string[];
    
    planned_course_ids: string[];
    planned_not_used_course_ids: string[];
    
    saved_course_ids: string[];
    saved_not_used_course_ids: string[];
}

