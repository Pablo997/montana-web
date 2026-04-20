import { z } from 'zod';
import type { IncidentType, SeverityLevel } from '@/types/incident';

/**
 * Zod schemas for every user-provided payload that crosses a trust
 * boundary (browser → Supabase RPC, browser → HTTP handler). Keeping
 * them in one place gives us:
 *
 *   - A single source of truth for validation that the form, the API
 *     client and future Server Actions can all reuse.
 *   - Better error messages than raw string checks.
 *   - Inferred TypeScript types (`CreateIncidentInput`) so the form
 *     payload and the RPC signature can never drift.
 *
 * Keep the catalogue of allowed values in sync with the enums in
 * `src/types/incident.ts` and the matching SQL enums in migration
 * `00001_initial_schema.sql`. If you touch one, update the other two.
 */

const INCIDENT_TYPES = [
  'accident',
  'trail_blocked',
  'detour',
  'water_source',
  'shelter',
  'point_of_interest',
  'wildlife',
  'weather_hazard',
  'other',
] as const satisfies readonly IncidentType[];

const SEVERITY_LEVELS = ['mild', 'moderate', 'severe'] as const satisfies readonly SeverityLevel[];

export const IncidentTypeSchema = z.enum(INCIDENT_TYPES);
export const SeverityLevelSchema = z.enum(SEVERITY_LEVELS);

/** WGS84 point. Matches `geography(Point, 4326)` bounds on the server. */
export const LatLngSchema = z.object({
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
});

/**
 * Input accepted by `createIncident`. Limits mirror the CHECK
 * constraints in `public.incidents` so validation fails fast on the
 * client before we round-trip to Postgres.
 *
 * Elevation bounds cover every reachable point on Earth (Dead Sea
 * floor ≈ -430 m, Everest ≈ 8849 m) with generous slack.
 */
export const CreateIncidentSchema = z.object({
  type: IncidentTypeSchema,
  severity: SeverityLevelSchema,
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  location: LatLngSchema,
  elevationM: z.number().finite().gte(-500).lte(9000).optional(),
});

export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;

/** Bounding box used by `fetchIncidentsInBbox`. */
export const BBoxSchema = z
  .object({
    minLng: z.number().finite().gte(-180).lte(180),
    minLat: z.number().finite().gte(-90).lte(90),
    maxLng: z.number().finite().gte(-180).lte(180),
    maxLat: z.number().finite().gte(-90).lte(90),
  })
  .refine((b) => b.minLng <= b.maxLng && b.minLat <= b.maxLat, {
    message: 'Bounding box min must be <= max on both axes.',
  });

export type BBox = z.infer<typeof BBoxSchema>;

/** Vote value allowed by `incident_votes.vote`. */
export const VoteSchema = z.union([z.literal(1), z.literal(-1)]);
export type Vote = z.infer<typeof VoteSchema>;
