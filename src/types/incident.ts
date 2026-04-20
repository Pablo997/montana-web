export type IncidentType =
  | 'accident'
  | 'trail_blocked'
  | 'detour'
  | 'water_source'
  | 'shelter'
  | 'point_of_interest'
  | 'wildlife'
  | 'weather_hazard'
  | 'other';

export type SeverityLevel = 'mild' | 'moderate' | 'severe';

export type IncidentStatus = 'pending' | 'validated' | 'resolved' | 'dismissed';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Incident {
  id: string;
  userId: string;
  type: IncidentType;
  severity: SeverityLevel;
  status: IncidentStatus;
  title: string;
  description: string | null;
  location: LatLng;
  elevationM: number | null;
  upvotes: number;
  downvotes: number;
  score: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface IncidentMedia {
  id: string;
  incidentId: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

export interface IncidentVote {
  incidentId: string;
  userId: string;
  vote: 1 | -1;
  createdAt: string;
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  accident: 'Accident',
  trail_blocked: 'Trail blocked',
  detour: 'Detour',
  water_source: 'Water source',
  shelter: 'Shelter',
  point_of_interest: 'Point of interest',
  wildlife: 'Wildlife',
  weather_hazard: 'Weather hazard',
  other: 'Other',
};

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};
