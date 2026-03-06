import {
  IsEmail,
  IsString,
  MinLength,
  IsArray,
  ArrayNotEmpty,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UserProgramDto {
  @IsString()
  @IsNotEmpty()
  program_id: string;

  @IsString()
  @IsNotEmpty()
  type: 'major' | 'minor';

  @IsArray()
  @IsString({ each: true })
  concentration_names: string[];
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  netid: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @IsNotEmpty()
  college_id: string;

  @IsString()
  @IsNotEmpty()
  entry_year: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UserProgramDto)
  programs: UserProgramDto[];
}
