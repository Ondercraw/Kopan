import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CounterDocument = HydratedDocument<Counter>;

@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  value: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
