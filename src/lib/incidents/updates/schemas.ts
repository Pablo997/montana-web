import { z } from 'zod';

/**
 * Zod schema mirroring the `public.incident_updates.body` CHECK
 * constraint (`char_length(body) between 1 and 500`). Trim happens
 * *before* the length check so a user can't sneak a 501-char payload
 * past the DB by padding with whitespace.
 *
 * Kept alongside the incidents schemas to avoid a separate barrel;
 * it's the same trust boundary (browser → Supabase) as the rest.
 */
export const CreateIncidentUpdateSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something before posting.')
    .max(500, 'Updates are limited to 500 characters.'),
});

export type CreateIncidentUpdateInput = z.infer<typeof CreateIncidentUpdateSchema>;
