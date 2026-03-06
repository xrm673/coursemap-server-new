import { Controller, Get, Param } from '@nestjs/common';
import { CatalogService } from '../service/catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('colleges')
  getAllColleges() {
    return this.catalogService.getAllColleges();
  }

  @Get('programs')
  getAllPrograms() {
    return this.catalogService.getAllPrograms();
  }

  @Get('programs/:programId/concentrations')
  getConcentrationsByProgram(@Param('programId') programId: string) {
    return this.catalogService.getConcentrationsByProgram(programId);
  }
}
