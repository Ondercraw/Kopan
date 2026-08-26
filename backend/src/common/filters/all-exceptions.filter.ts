import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = String(response.getHeader('x-request-id') ?? '');
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const payload =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};
    const message = this.normalizarMensaje(
      payload.message ?? exceptionResponse,
      status,
    );
    const code = typeof payload.code === 'string' ? payload.code : undefined;

    if (status >= 500) {
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.url,
        }),
        stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      ...(code ? { code } : {}),
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  private normalizarMensaje(value: unknown, status: number): string | string[] {
    if (typeof value === 'string' || Array.isArray(value)) {
      return value as string | string[];
    }

    return status >= 500
      ? 'Ocurrió un error interno'
      : 'La solicitud no es válida';
  }
}
