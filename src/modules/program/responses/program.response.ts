import { CourseOption } from "./course.response";
import { Requirement } from "./requirement.response";

export interface ProgramResponse {
    info: ProgramInfo;
    summary: ProgramSummary;
    concentrationNames: string[];
    courses: Record<string, CourseOption>;
    requirements: Requirement[];
}

interface ProgramInfo {
    id: string;
    name: string;
    type: "major" | "minor";
    colleges: CollegeInProgram[];
    relevantSubjects: string[];
}

interface CollegeInProgram {
    id: string;
    name: string;
}

interface ProgramSummary {
    isUserProgram: boolean;
    isFulfilled: boolean;
    completedCoursesCount: number;
    requiredCoursesCount: number;
    completedCreditsCount: number;
    requiredCreditsCount: number;
}
