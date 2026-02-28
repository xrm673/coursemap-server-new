type CourseOptionType = "COURSE" | "REPLACEMENT"
type CourseTakingStatus = "COMPLETED" | "IN_PROGRESS" | "PLANNED" | "SAVED" | "NOT_ON_SCHEDULE"

export class CourseOption {
    id: string;
    topic: string;
    type: CourseOptionType;
    course_info: CourseInfo;
    enroll_groups: EnrollGroup[];
    user_state: CourseUserState;
    used_in_requirements: string[];
    not_used_in_requirements: NotUsedInRequirement[];
}

class CourseInfo {
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
}

class CourseAttribute {
    attribute_value: string;
    attribute_type: string;
}

class EnrollGroup {
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

class ClassSection {
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

class Meeting {
    id: number;
    time_start: string;
    time_end: string;
    pattern: string;
    start_date: string;
    end_date: string;
    instructors: Instructor[];
}

class Instructor {
    netid: string;
    first_name: string;
    middle_name: string;
    last_name: string;
}

class CourseUserState {
    status: CourseTakingStatus;
    credits_received: number;
    semester: string;
    sections: string[];
    is_semester_available: boolean;
    is_location_available: boolean;
}

class NotUsedInRequirement {
    requirement_id: string;
    reason: string;
    blocked_by_requirement_id: string;
}