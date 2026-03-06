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
  programId: string;

  @IsString()
  @IsNotEmpty()
  type: 'major' | 'minor';

  @IsArray()
  @IsString({ each: true })
  concentrationNames: string[];
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
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  collegeId: string;

  @IsString()
  @IsNotEmpty()
  entryYear: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UserProgramDto)
  programs: UserProgramDto[];
}
