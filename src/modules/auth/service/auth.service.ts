import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../../user/service/user.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const { net_id, email, password, first_name, last_name, college_id, entry_year, programs } = dto;

    const existingByEmail = await this.userService.findByEmail(email);
    if (existingByEmail) {
      throw new ConflictException('该邮箱已被注册');
    }

    const existingByNetId = await this.userService.findByNetId(net_id);
    if (existingByNetId) {
      throw new ConflictException('该 NetID 已被注册');
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await this.userService.create(
      {
        net_id,
        email,
        password: hashed,
        first_name,
        last_name,
        entry_year,
        colleges: { connect: { id: college_id } },
      },
      programs,
    );

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
  }

  async login(dto: LoginDto) {
    const { email, password } = dto;

    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
  }
}
