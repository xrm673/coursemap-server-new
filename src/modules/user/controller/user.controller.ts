import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserService } from '../service/user.service';
import { UserResponse } from '../responses/user.response';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getMe(@Req() req: any) {
    const user = await this.userService.findById(req.user.id);
    return plainToInstance(UserResponse, user, { excludeExtraneousValues: true });
  }
}
