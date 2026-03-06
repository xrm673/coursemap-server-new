export interface CollegeResponse {
  collegeId: string;
  name: string;
}

export interface ProgramResponse {
  programId: string;
  name: string;
  type: string;
  colleges: CollegeResponse[];
  concentrations: string[];
}