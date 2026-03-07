export interface Requirement {
    info: RequirementInfo;
    rootNode: Select | CourseSet;
}

interface RequirementInfo {
    id: string;
    name: string;
    description: string[];
    programId: string;
    concentrationName: string;
    uiType: "GROUP" | "LIST";
}

interface SelectRule {
    requiredChildrenCount?: number;
    requiredUnitsCount?: number;
    unitsType?: "COURSE" | "CREDIT";
}

interface CourseSetRule {
    requiredUnitsCount: number;
    unitsType: "COURSE" | "CREDIT";
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
    fulfilledChildIds: string[];
    summary: SelectSummary;
}

interface SelectSummary {
    isFulfilled: boolean;
    appliedUnitsCount: number;
}

interface CourseSet extends NodeBase {
    type: "COURSE_SET";
    requiredCourseIds: string[];
    summary: CourseSetSummary;
}

interface CourseSetSummary {
    isFulfilled: boolean;
    appliedUnitsCount: number;

    completedAppliedCourseIds: string[];
    completedUnappliedCourseIds: string[];

    inProgressAppliedCourseIds: string[];
    inProgressUnappliedCourseIds: string[];

    plannedAppliedCourseIds: string[];
    plannedUnappliedCourseIds: string[];

    savedAppliedCourseIds: string[];
    savedUnappliedCourseIds: string[];
}
