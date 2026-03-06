import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogRepo } from '../repo/catalog.repo';
import { CollegeResponse, ProgramResponse } from '../responses/catalog.response';

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepo: CatalogRepo) {}

  async getAllColleges(): Promise<CollegeResponse[]> {
    const rows = await this.catalogRepo.findAllColleges();
    return rows.map((c) => ({ collegeId: c.id, name: c.name }));
  }

  async getAllPrograms(): Promise<ProgramResponse[]> {
    const rows = await this.catalogRepo.findAllPrograms();
    return rows.map((p) => ({
      programId: p.id,
      name: p.name,
      type: p.type,
      colleges: p.college_programs.map((cp) => ({
        collegeId: cp.colleges.id,
        name: cp.colleges.name,
      })),
      concentrations: p.program_concentrations.map((c) => c.concentration_name),
    }));
  }

  async getConcentrationsByProgram(programId: string): Promise<string[]> {
    const rows = await this.catalogRepo.findConcentrationsByProgram(programId);
    if (rows.length === 0) {
      const programs = await this.catalogRepo.findAllPrograms();
      const exists = programs.some((p) => p.id === programId);
      if (!exists) throw new NotFoundException(`Program "${programId}" not found`);
    }
    return rows.map((r) => r.concentration_name);
  }
}
