export interface UserCollege {
  collegeId: string;
  name: string;
}

export interface UserProgram {
  programId: string;
  name: string;
  type: string;
  concentrationNames: string[];
}

export interface UserResponse {
  id: number;
  netid: string;
  email: string;
  firstName: string;
  lastName: string;
  entryYear: string;
  college: UserCollege;
  programs: UserProgram[];
  semesters: string[];
}
