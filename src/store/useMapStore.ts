import { create } from 'zustand';
import type { Incident, IncidentType, SeverityLevel } from '@/types/incident';

interface MapFilters {
  types: IncidentType[] | null;
  minSeverity: SeverityLevel | null;
  onlyValidated: boolean;
}

interface MapState {
  incidents: Map<string, Incident>;
  selectedId: string | null;
  filters: MapFilters;
  setIncidents: (incidents: Incident[]) => void;
  upsertIncident: (incident: Incident) => void;
  removeIncident: (id: string) => void;
  select: (id: string | null) => void;
  setFilters: (filters: Partial<MapFilters>) => void;
}

export const useMapStore = create<MapState>((set) => ({
  incidents: new Map(),
  selectedId: null,
  filters: {
    types: null,
    minSeverity: null,
    onlyValidated: false,
  },
  setIncidents: (incidents) =>
    set(() => ({
      incidents: new Map(incidents.map((i) => [i.id, i])),
    })),
  upsertIncident: (incident) =>
    set((state) => {
      const next = new Map(state.incidents);
      next.set(incident.id, incident);
      return { incidents: next };
    }),
  removeIncident: (id) =>
    set((state) => {
      const next = new Map(state.incidents);
      next.delete(id);
      return { incidents: next };
    }),
  select: (id) => set({ selectedId: id }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
}));
