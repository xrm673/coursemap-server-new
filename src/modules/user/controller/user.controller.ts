import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserService } from '../service/user.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getMe(@Req() req: any) {
    const user = await this.userService.findByIdWithDetails(req.user.id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
