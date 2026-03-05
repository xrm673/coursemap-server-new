import { CourseOption } from "./course.response";
import { Requirement } from "./requirement.response";

export interface ProgramResponse {
    info: ProgramInfo;
    summary: ProgramSummary;
    concentration_names: string[];
    courses: Record<string, CourseOption>;
    requirements: Requirement[];
}

interface ProgramInfo {
    id: string;
    name: string;
    type: "major" | "minor";
    colleges: CollegeInProgram[];
    relevant_subjects: string[];
}

interface CollegeInProgram {
    id: string;
    name: string;
}

interface ProgramSummary {
    is_user_program: boolean;
    is_fulfilled: boolean;
    completed_courses_count: number;
    required_courses_count: number;
    completed_credits_count: number;
    required_credits_count: number;
}
