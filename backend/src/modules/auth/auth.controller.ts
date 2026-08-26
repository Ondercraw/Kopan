import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

const COOKIE_NAME = 'access_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const empleado = await this.authService.validarCredenciales(
      dto.email,
      dto.password,
    );

    const payload: JwtPayload = {
      sub: empleado._id.toString(),
      email: empleado.email,
      nombre: empleado.nombre,
      roles: empleado.roles,
    };

    const token = this.authService.generarToken(payload);
    this.setCookie(res, token);

    return {
      id: payload.sub,
      email: payload.email,
      nombre: payload.nombre,
      roles: payload.roles,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, this.cookieOptions());
    return { message: 'Sesión cerrada' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return {
      id: user.sub,
      email: user.email,
      nombre: user.nombre,
      roles: user.roles,
    };
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, this.cookieOptions());
  }

  private cookieOptions() {
    const isProd = this.configService.get<string>('nodeEnv') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: this.jwtDurationMs(),
      path: '/',
    };
  }

  private jwtDurationMs(): number {
    const duration = this.configService.get<string>('jwt.expiresIn') ?? '8h';
    const match = /^(\d+)(s|m|h|d)$/.exec(duration);

    if (!match) {
      return 8 * 60 * 60 * 1000;
    }

    const value = Number(match[1]);
    const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * unitMs[match[2] as keyof typeof unitMs];
  }
}
