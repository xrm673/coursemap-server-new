type CourseOptionType = "COURSE" // 暂时只有这一种
type CourseTakingStatus = "COMPLETED" | "IN_PROGRESS" | "PLANNED" | "SAVED" | "NOT_ON_SCHEDULE"

export interface CourseOption {
    id: string;
    topic: string;
    type: CourseOptionType;
    course_info: CourseInfo;
    enroll_groups: EnrollGroup[];
    user_state: CourseUserState;
    combined_course_info: CombinedCourseInfo;
}

interface CourseInfo {
    subject: string;
    number: string;
    level: number;
    title_short: string;
    title_long: string;
    description: string;
    enrollment_priority: string;
    forbidden_overlaps: string;
    prereq: string;
    coreq: string;
    fee: string;
    acad_career: string;
    acad_group: string;
    last_offered_semester: string;
    last_offered_year: number;
    course_attributes: CourseAttribute[];
    satisfies_requirements: string[];
}

interface CourseAttribute {
    attribute_value: string;
    attribute_type: string;
}

interface EnrollGroup {
    id: number;
    semester: string;
    first_section_number: string;
    topic: string;
    credits_minimum: number;
    credits_maximum: number;
    grading_basis: string;
    session_code: string;
    combined_group_id: number;
    class_sections: ClassSection[];
}

interface ClassSection {
    id: number;
    section_type: string;
    section_number: string;
    class_nbr: number;
    location: string;
    campus: string;
    start_date: string;
    end_date: string;
    add_consent: string;
    is_component_graded: boolean;
    instruction_mode: string;
    section_topic: string;
    open_status: string;
    meetings: Meeting[];
}

interface Meeting {
    id: number;
    time_start: string;
    time_end: string;
    pattern: string;
    start_date: string;
    end_date: string;
    instructors: Instructor[];
}

interface Instructor {
    netid: string;
    first_name: string;
    middle_name: string;
    last_name: string;
}

interface CourseUserState {
    status: CourseTakingStatus;
    is_scheduled: boolean;
    credits_received: number;
    semester: string;
    sections_numbers: string[];
    is_semester_available: boolean;
    is_location_available: boolean;
    applies_to_requirements: string[];
    unapplies_to_requirements: UnappliesToRequirement[];
}

interface CombinedCourseInfo {
    combined_group_id: number;
    combined_course_ids: string[];
}

interface UnappliesToRequirement {
    requirement_id: string;
    reason: "OVERLIMIT" | "CONFLICT" | "INACTIVE";
    blocked_by_requirement_id: string;
}
