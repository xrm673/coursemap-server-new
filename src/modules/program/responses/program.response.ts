import { CourseOption } from "./course.response";
import { Requirement } from "./requirement.response";

export class ProgramResponse {
    info: ProgramInfo;
    summary: ProgramSummary;
    concentration_names: string[];
    courses: Record<string, CourseOption>;
    requirements: Requirement[];
}

class ProgramInfo {
    id: string;
    name: string;
    type: "major" | "minor";
    description: string;
    colleges: CollegeInProgram[];
    relevant_subjects: string[];
}

class CollegeInProgram {
    id: string;
    name: string;
}

class ProgramSummary {
    is_user_program: boolean;
    is_fulfilled: boolean;
    completed_courses_count: number;
    required_courses_count: number;
}