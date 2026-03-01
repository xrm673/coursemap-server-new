import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ProgramService } from '../service/program.service';

@Controller('programs')
@UseGuards(JwtAuthGuard)
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  @Get(':programId')
  getProgram(@Param('programId') programId: string, @Req() req: any) {
    return this.programService.getProgramResponse(programId, req.user.id);
  }
}
