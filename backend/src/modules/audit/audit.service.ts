import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.auditModel.create(entry);
    } catch (error: unknown) {
      // La auditoría no debe convertir una operación ya aplicada (por ejemplo
      // sumar stock) en un falso error que el usuario pueda reintentar.
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo registrar auditoría ${entry.action} para ${entry.entityId}: ${detail}`,
      );
    }
  }
}
