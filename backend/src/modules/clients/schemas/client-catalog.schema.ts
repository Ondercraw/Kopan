import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClientCatalogDocument = HydratedDocument<ClientCatalog>;
export enum ClientCatalogKind { GROUP = 'GROUP', LOCATION = 'LOCATION' }

@Schema({ collection: 'client_catalogs', timestamps: true })
export class ClientCatalog {
  @Prop({ required: true, enum: ClientCatalogKind, index: true })
  kind: ClientCatalogKind;

  @Prop({ required: true, trim: true, maxlength: 80 })
  nombre: string;

  @Prop({ required: true, lowercase: true })
  normalizedName: string;

  @Prop({ default: true })
  activo: boolean;
}

export const ClientCatalogSchema = SchemaFactory.createForClass(ClientCatalog);
ClientCatalogSchema.index({ kind: 1, normalizedName: 1 }, { unique: true });
