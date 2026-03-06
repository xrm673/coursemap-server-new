import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { UserService } from '../../user/service/user.service';
import { SignUpDto } from '../../auth/dto/sign-up.dto';
import { LoginDto } from '../dto/login.dto';
import { JwtPayload } from '../strategies/jwt.strategy';
import { AuthResponse } from '../responses/auth.response';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async signUp(dto: SignUpDto) {
    const { netid, email, password, firstName, lastName, collegeId, entryYear, programs } = dto;

    const existingByEmail = await this.userService.findByEmail(email);
    if (existingByEmail) {
      throw new ConflictException('该邮箱已被注册');
    }

    const existingByNetId = await this.userService.findByNetId(netid);
    if (existingByNetId) {
      throw new ConflictException('该 NetID 已被注册');
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await this.userService.create(
      {
        netid,
        email,
        password: hashed,
        first_name: firstName,
        last_name: lastName,
        entry_year: entryYear,
        colleges: { connect: { id: collegeId } },
        created_at: new Date(),
        updated_at: new Date(),
      },
      programs,
    );

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return plainToInstance(AuthResponse, { access_token: this.jwtService.sign(payload) }, { excludeExtraneousValues: true });
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
    return plainToInstance(AuthResponse, { access_token: this.jwtService.sign(payload) }, { excludeExtraneousValues: true });
  }
}
