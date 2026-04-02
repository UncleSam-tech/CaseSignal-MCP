import { z } from 'zod';

export const FieldOriginSchema = z.enum(['observed', 'normalized', 'inferred', 'unknown']);
export type FieldOrigin = z.infer<typeof FieldOriginSchema>;

export function taggedField<T extends z.ZodTypeAny>(inner: T) {
  return z.object({ value: inner, origin: FieldOriginSchema });
}
