import { create } from 'zustand';
import type { Incident, LatLng } from '@/types/incident';
import { DEFAULT_FILTERS, type MapFilters } from '@/lib/incidents/filters';

interface MapState {
  incidents: Map<string, Incident>;
  selectedId: string | null;
  filters: MapFilters;

  reportOpen: boolean;
  reportLocation: LatLng | null;
  pickingLocation: boolean;

  setIncidents: (incidents: Incident[]) => void;
  mergeIncidents: (incidents: Incident[]) => void;
  upsertIncident: (incident: Incident) => void;
  removeIncident: (id: string) => void;
  select: (id: string | null) => void;
  setFilters: (filters: Partial<MapFilters>) => void;

  openReport: (location: LatLng | null) => void;
  closeReport: () => void;
  startPickingLocation: () => void;
  cancelPickingLocation: () => void;
  setReportLocation: (location: LatLng) => void;
}

export const useMapStore = create<MapState>((set) => ({
  incidents: new Map(),
  selectedId: null,
  filters: { ...DEFAULT_FILTERS },
  reportOpen: false,
  reportLocation: null,
  pickingLocation: false,

  setIncidents: (incidents) =>
    set(() => ({
      incidents: new Map(incidents.map((i) => [i.id, i])),
    })),
  mergeIncidents: (incidents) =>
    set((state) => {
      const next = new Map(state.incidents);
      incidents.forEach((i) => next.set(i.id, i));
      return { incidents: next };
    }),
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

  openReport: (location) =>
    set({ reportOpen: true, reportLocation: location, pickingLocation: false }),
  closeReport: () => set({ reportOpen: false, pickingLocation: false }),
  startPickingLocation: () => set({ reportOpen: false, pickingLocation: true }),
  cancelPickingLocation: () => set({ pickingLocation: false, reportOpen: true }),
  setReportLocation: (location) =>
    set({ reportLocation: location, reportOpen: true, pickingLocation: false }),
}));
