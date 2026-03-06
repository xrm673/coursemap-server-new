import { Injectable } from '@nestjs/common';
import { UserRepo } from '../repo/user.repo';
import { Prisma } from '@prisma/client';
import { UserProgramDto } from '../../auth/dto/register.dto';

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepo) {}

  async findByEmail(email: string) {
    return this.userRepo.findByEmail(email);
  }

  async findByNetId(netid: string) {
    return this.userRepo.findByNetId(netid);
  }

  async findById(id: number) {
    return this.userRepo.findById(id);
  }

  async findByIdWithDetails(id: number) {
    const user = await this.userRepo.findByIdWithDetails(id);
    if (!user) return null;
    return mapUserDetails(user);
  }

  async create(data: Prisma.usersCreateInput, programs: UserProgramDto[]) {
    return this.userRepo.create(data, programs);
  }

  async findUserContext(userId: number) {
    return this.userRepo.findUserContext(userId);
  }
}

// ── Helpers ──

type UserWithDetails = NonNullable<
  Awaited<ReturnType<UserRepo['findByIdWithDetails']>>
>;

function buildSemesters(entryYear: string): string[] {
  const start = parseInt(entryYear, 10);
  const semesters: string[] = [];
  for (let i = 0; i < 4; i++) {
    semesters.push('FA' + String(start + i).slice(-2));
    semesters.push('SP' + String(start + i + 1).slice(-2));
  }
  return semesters;
}

function mapUserDetails(user: UserWithDetails) {
  const concentrations = user.user_concentration.map(
    (uc) => uc.program_concentrations,
  );

  return {
    id: user.id,
    netid: user.netid,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    entryYear: user.entry_year,
    college: {
      collegeId: user.colleges.id,
      name: user.colleges.name,
    },
    programs: user.user_program.map(({ programs: p }) => ({
      programId: p.id,
      name: p.name,
      type: p.type,
      concentrationNames: concentrations
        .filter((c) => c.program_id === p.id)
        .map((c) => c.concentration_name),
    })),
    semesters: buildSemesters(user.entry_year),
  };
}
