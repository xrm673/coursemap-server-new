type CourseOptionType = "COURSE" // 暂时只有这一种
type CourseTakingStatus = "COMPLETED" | "IN_PROGRESS" | "PLANNED" | "SAVED" | "NOT_ON_SCHEDULE"

export interface CourseOption {
    id: string;
    topic: string;
    type: CourseOptionType;
    courseInfo: CourseInfo;
    enrollGroups: EnrollGroup[];
    userState: CourseUserState;
    combinedCourseInfo: CombinedCourseInfo;
}

interface CourseInfo {
    subject: string;
    number: string;
    level: number;
    titleShort: string;
    titleLong: string;
    description: string;
    enrollmentPriority: string;
    forbiddenOverlaps: string;
    prereq: string;
    coreq: string;
    fee: string;
    acadCareer: string;
    acadGroup: string;
    lastOfferedSemester: string;
    lastOfferedYear: number;
    courseAttributes: CourseAttribute[];
    satisfiesRequirements: string[];
}

interface CourseAttribute {
    attributeValue: string;
    attributeType: string;
}

interface EnrollGroup {
    id: number;
    semester: string;
    firstSectionNumber: string;
    topic: string;
    creditsMinimum: number;
    creditsMaximum: number;
    gradingBasis: string;
    sessionCode: string;
    combinedGroupId: number;
    classSections: ClassSection[];
}

interface ClassSection {
    id: number;
    sectionType: string;
    sectionNumber: string;
    classNbr: number;
    location: string;
    campus: string;
    startDate: string;
    endDate: string;
    addConsent: string;
    isComponentGraded: boolean;
    instructionMode: string;
    sectionTopic: string;
    openStatus: string;
    meetings: Meeting[];
}

interface Meeting {
    id: number;
    timeStart: string;
    timeEnd: string;
    pattern: string;
    startDate: string;
    endDate: string;
    instructors: Instructor[];
}

interface Instructor {
    netid: string;
    firstName: string;
    middleName: string;
    lastName: string;
}

interface CourseUserState {
    status: CourseTakingStatus;
    isScheduled: boolean;
    creditsReceived: number;
    semester: string;
    sectionNumbers: string[];
    isSemesterAvailable: boolean;
    isLocationAvailable: boolean;
    appliesToRequirements: string[];
    unappliesToRequirements: UnappliesToRequirement[];
}

interface CombinedCourseInfo {
    combinedGroupId: number;
    combinedCourseIds: string[];
}

interface UnappliesToRequirement {
    requirementId: string;
    reason: "OVERLIMIT" | "CONFLICT" | "INACTIVE";
    blockedByRequirementId: string;
}
