import { Expose } from 'class-transformer';

export class AuthResponse {
  @Expose()
  access_token: string;
}
