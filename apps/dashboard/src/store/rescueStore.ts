import { create } from 'zustand';

export type Role = 'admin' | 'rescuer';

export type AdminNav = 'requests' | 'map' | 'teams';
export type RescuerNav = 'cases' | 'map' | 'messages';

export type SosStatus = 'idle' | 'sending' | 'sent' | 'assigned' | 'acknowledged' | 'rescued';

export interface ChatMessage {
  id: string;
  sender: 'survivor' | 'nearby' | 'rescuer';
  senderName: string;
  text: string;
  timestamp: string;
  target?: 'mesh' | 'rescuer';
}

export interface ClusterMember {
  id: string;
  name: string;
  condition: string;
  distanceMeters: number;
  lat: number;
  lon: number;
  phone?: string;
  emergencyNeeds?: string[];
  battery?: number;
}

export interface SosIncident {
  id: string;
  survivorName: string;
  lat: number;
  lon: number;
  nearbyCount: number;
  urgency: 'Emergency' | 'Urgent' | 'Stable';
  timeReceived: string;
  status: 'Pending' | 'Assigned' | 'In Progress' | 'Resolved';
  assignedTeam: string | null;
  acknowledged: boolean;
  notes?: string;
  clusterRadiusMeters: number;
  clusterMembers: ClusterMember[];
}

export interface RescueTeam {
  id: string;
  name: string;
  lead: string;
  members: number;
  status: 'Available' | 'Deployed' | 'En Route';
  currentSosId?: string | null;
  vehicle: string;
}

interface RescueState {
  // Navigation & Active Role (Admin or Rescuer)
  currentRole: Role;
  setRole: (role: Role) => void;

  adminNav: AdminNav;
  setAdminNav: (nav: AdminNav) => void;

  rescuerNav: RescuerNav;
  setRescuerNav: (nav: RescuerNav) => void;

  // Admin & Incident State
  sosList: SosIncident[];
  teams: RescueTeam[];
  selectedSosId: string | null;
  selectedPersonId: string | null;
  showIndividualPins: boolean;
  showClusterBoundaries: boolean;
  toggleIndividualPins: () => void;
  toggleClusterBoundaries: () => void;

  // Rescuer State
  rescuerLocation: { lat: number; lon: number };
  navDistanceRemaining: number;
  navEtaMinutes: number;
  isNavigating: boolean;
  rescuerMessages: ChatMessage[];

  // Actions
  assignTeam: (sosId: string, teamName: string) => void;
  acknowledgeSos: (sosId: string) => void;
  markResolved: (sosId: string) => void;
  selectSos: (sosId: string | null) => void;
  selectPerson: (personId: string | null) => void;
  startNavigation: () => void;
  stepNavigation: () => void;
  sendRescuerMessage: (text: string, senderRole?: 'rescuer' | 'survivor') => void;
  addSosIncident: (incident: Partial<SosIncident>) => void;
  resetDemo: () => void;
}

const INITIAL_SOS_LIST: SosIncident[] = [
  {
    id: 'SOS #1024',
    survivorName: 'Rohan Sharma & 3 others',
    lat: 18.5204,
    lon: 73.8567,
    nearbyCount: 4,
    urgency: 'Emergency',
    timeReceived: '3 min ago',
    status: 'Pending',
    assignedTeam: null,
    acknowledged: false,
    clusterRadiusMeters: 45,
    notes: 'Structural collapse on ground floor. 4 survivors trapped. Medical aid & stretcher needed.',
    clusterMembers: [
      {
        id: 'p-1024-1',
        name: 'Rohan Sharma (Beacon Lead)',
        condition: 'Trapped under rubble, severe leg fracture',
        distanceMeters: 0,
        lat: 18.5204,
        lon: 73.8567,
        phone: '+91 98220 11442',
        emergencyNeeds: ['First Aid', 'Stretcher'],
        battery: 68,
      },
      {
        id: 'p-1024-2',
        name: 'Priya Patil',
        condition: 'Injured right arm, conscious near entrance',
        distanceMeters: 25,
        lat: 18.5206,
        lon: 73.8569,
        phone: '+91 98220 33881',
        emergencyNeeds: ['First Aid', 'Water'],
        battery: 82,
      },
      {
        id: 'p-1024-3',
        name: 'Amit Deshmukh',
        condition: 'Trapped under concrete beam, respiratory distress',
        distanceMeters: 38,
        lat: 18.5202,
        lon: 73.8564,
        phone: '+91 98220 55119',
        emergencyNeeds: ['Oxygen', 'Heavy Lifting'],
        battery: 45,
      },
      {
        id: 'p-1024-4',
        name: 'Sunil Kulkarni (Elderly)',
        condition: 'Mobility impaired, safe on elevated platform',
        distanceMeters: 42,
        lat: 18.5203,
        lon: 73.8563,
        phone: '+91 98220 77220',
        emergencyNeeds: ['Evacuation Assist'],
        battery: 31,
      },
    ],
  },
  {
    id: 'SOS #1021',
    survivorName: 'Rahul Deshmukh & 2 others',
    lat: 18.5245,
    lon: 73.8522,
    nearbyCount: 3,
    urgency: 'Emergency',
    timeReceived: '14 min ago',
    status: 'Assigned',
    assignedTeam: 'Rescue Team Bravo',
    acknowledged: true,
    clusterRadiusMeters: 40,
    notes: 'Submerged basement parking. Rising water level (3.5 ft). Infant on site.',
    clusterMembers: [
      {
        id: 'p-1021-1',
        name: 'Rahul Deshmukh',
        condition: 'Trapped in submerged vehicle, hypothermia risk',
        distanceMeters: 0,
        lat: 18.5245,
        lon: 73.8522,
        phone: '+91 97650 22119',
        emergencyNeeds: ['Boat', 'Warmth'],
        battery: 28,
      },
      {
        id: 'p-1021-2',
        name: 'Deepak Shinde',
        condition: 'Stranded on car roof, non-swimmer',
        distanceMeters: 18,
        lat: 18.5247,
        lon: 73.8524,
        phone: '+91 97650 33882',
        emergencyNeeds: ['Life Jacket'],
        battery: 54,
      },
      {
        id: 'p-1021-3',
        name: 'Kavita Rao & Infant',
        condition: 'Maternal distress, high water level',
        distanceMeters: 32,
        lat: 18.5243,
        lon: 73.8520,
        phone: '+91 97650 44990',
        emergencyNeeds: ['Infant Care', 'Evacuation'],
        battery: 40,
      },
    ],
  },
  {
    id: 'SOS #1019',
    survivorName: 'Sunita Patil',
    lat: 18.5178,
    lon: 73.8611,
    nearbyCount: 1,
    urgency: 'Stable',
    timeReceived: '50 min ago',
    status: 'Resolved',
    assignedTeam: 'Rescue Team Charlie',
    acknowledged: true,
    clusterRadiusMeters: 25,
    notes: 'Elderly citizen evacuated successfully to relief tent.',
    clusterMembers: [
      {
        id: 'p-1019-1',
        name: 'Sunita Patil',
        condition: 'Safe in relief shelter, medical checkup done',
        distanceMeters: 0,
        lat: 18.5178,
        lon: 73.8611,
        phone: '+91 98224 88112',
        emergencyNeeds: ['Safe'],
        battery: 95,
      },
    ],
  },
];

const INITIAL_TEAMS: RescueTeam[] = [
  {
    id: 'team-alpha',
    name: 'Rescue Team Alpha',
    lead: 'Capt. Vikram Singh',
    members: 6,
    status: 'Available',
    vehicle: 'Tactical Rescue Truck (TR-01)',
  },
  {
    id: 'team-bravo',
    name: 'Rescue Team Bravo',
    lead: 'Lt. Sneha Joshi',
    members: 4,
    status: 'Deployed',
    currentSosId: 'SOS #1021',
    vehicle: 'Amphibious Response Unit (AR-04)',
  },
  {
    id: 'team-charlie',
    name: 'Rescue Team Charlie',
    lead: 'Insp. R. K. Nair',
    members: 5,
    status: 'Available',
    vehicle: 'Mobile Medical Ambulance (MED-02)',
  },
];

const INITIAL_RESCUER_CHAT: ChatMessage[] = [
  {
    id: 'r1',
    sender: 'rescuer',
    senderName: 'Rescue Team Alpha',
    text: 'We have received your SOS. Stay at your current location if safe.',
    timestamp: '14:20',
    target: 'rescuer',
  },
  {
    id: 'r2',
    sender: 'survivor',
    senderName: 'Rohan Sharma (Survivor A)',
    text: 'We are near the main entrance under the collapsed stairwell.',
    timestamp: '14:21',
    target: 'rescuer',
  },
];

export const useRescueStore = create<RescueState>((set, get) => ({
  // Defaults to Admin / Control Center
  currentRole: 'admin',
  setRole: (role) => set({ currentRole: role }),

  adminNav: 'requests',
  setAdminNav: (nav) => set({ adminNav: nav }),

  rescuerNav: 'cases',
  setRescuerNav: (nav) => set({ rescuerNav: nav }),

  // Incident & Admin State
  sosList: INITIAL_SOS_LIST,
  teams: INITIAL_TEAMS,
  selectedSosId: 'SOS #1024',
  selectedPersonId: null,
  showIndividualPins: true,
  showClusterBoundaries: true,
  toggleIndividualPins: () => set((state) => ({ showIndividualPins: !state.showIndividualPins })),
  toggleClusterBoundaries: () => set((state) => ({ showClusterBoundaries: !state.showClusterBoundaries })),

  // Rescuer State
  rescuerLocation: { lat: 18.5235, lon: 73.8595 },
  navDistanceRemaining: 420,
  navEtaMinutes: 3,
  isNavigating: false,
  rescuerMessages: INITIAL_RESCUER_CHAT,

  assignTeam: (sosId, teamName) => {
    set((state) => {
      const updatedSos = state.sosList.map((s) =>
        s.id === sosId ? { ...s, assignedTeam: teamName, status: 'Assigned' as const } : s,
      );

      const updatedTeams = state.teams.map((t) =>
        t.name === teamName ? { ...t, status: 'Deployed' as const, currentSosId: sosId } : t,
      );

      // Notify survivor over shared chat endpoint
      if (typeof window !== 'undefined') {
        fetch('/v1/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: 'cl_pune_ghats_01',
            senderFp: 'team_alpha',
            senderName: teamName,
            senderRole: 'rescuer',
            content: `🚨 ${teamName} has been assigned to your cluster! We are en route with rescue gear. Maintain your position and conserve battery.`,
          }),
        }).catch(() => {});
      }

      const dispatchChat: ChatMessage = {
        id: `msg_disp_${Date.now()}`,
        sender: 'rescuer',
        senderName: teamName,
        text: `🚨 ${teamName} assigned & deployed to incident ${sosId}. Rescuers en route.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        target: 'rescuer',
      };

      return {
        sosList: updatedSos,
        teams: updatedTeams,
        rescuerMessages: [...state.rescuerMessages, dispatchChat],
      };
    });
  },

  acknowledgeSos: (sosId) => {
    set((state) => {
      const updatedSos = state.sosList.map((s) =>
        s.id === sosId ? { ...s, acknowledged: true, status: 'In Progress' as const } : s,
      );

      const ackMsg: ChatMessage = {
        id: `ack_${Date.now()}`,
        sender: 'rescuer',
        senderName: 'Rescue Team Alpha',
        text: 'Rescue team has received your SOS. Help is on the way.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        target: 'rescuer',
      };

      return {
        sosList: updatedSos,
        rescuerMessages: [...state.rescuerMessages, ackMsg],
      };
    });
  },

  markResolved: (sosId) => {
    set((state) => {
      const updatedSos = state.sosList.map((s) =>
        s.id === sosId ? { ...s, status: 'Resolved' as const } : s,
      );

      const target = state.sosList.find((s) => s.id === sosId);
      const teamNameToFree = target?.assignedTeam;

      const updatedTeams = state.teams.map((t) =>
        t.name === teamNameToFree ? { ...t, status: 'Available' as const, currentSosId: null } : t,
      );

      return {
        sosList: updatedSos,
        teams: updatedTeams,
        isNavigating: false,
        navDistanceRemaining: 0,
      };
    });
  },

  selectSos: (sosId) => set({ selectedSosId: sosId, selectedPersonId: null }),
  selectPerson: (personId) => set({ selectedPersonId: personId }),

  startNavigation: () => {
    set({ isNavigating: true });
  },

  stepNavigation: () => {
    set((state) => {
      if (!state.isNavigating) return state;
      const nextDist = Math.max(0, state.navDistanceRemaining - 90);
      const nextEta = Math.max(0, Math.ceil(nextDist / 120));
      return {
        navDistanceRemaining: nextDist,
        navEtaMinutes: nextEta,
        rescuerLocation: {
          lat: state.rescuerLocation.lat + (18.5204 - state.rescuerLocation.lat) * 0.35,
          lon: state.rescuerLocation.lon + (73.8567 - state.rescuerLocation.lon) * 0.35,
        },
      };
    });
  },

  sendRescuerMessage: (text, senderRole) => {
    const role = senderRole || (get().currentRole === 'rescuer' ? 'rescuer' : 'survivor');
    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: role,
      senderName: role === 'rescuer' ? 'Rescue Team Alpha' : 'Rohan Sharma',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      target: 'rescuer',
    };
    set((state) => ({ rescuerMessages: [...state.rescuerMessages, newMsg] }));

    if (typeof window !== 'undefined') {
      fetch('/v1/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'cl_pune_ghats_01',
          senderFp: role === 'rescuer' ? 'team_alpha' : 'survivor_node',
          senderName: role === 'rescuer' ? 'Rescue Team Alpha' : 'Survivor',
          senderRole: role,
          content: text,
        }),
      }).catch(() => {});
    }
  },

  addSosIncident: (inc) => {
    set((state) => {
      const existing = state.sosList.find((s) => s.id === inc.id);
      if (existing) {
        return {
          sosList: state.sosList.map((s) => (s.id === inc.id ? { ...s, ...inc } : s)),
        };
      }
      const full: SosIncident = {
        id: inc.id || `SOS #${Math.floor(1000 + Math.random() * 9000)}`,
        survivorName: inc.survivorName || 'Survivor & Group',
        lat: inc.lat ?? 18.5204,
        lon: inc.lon ?? 73.8567,
        nearbyCount: inc.nearbyCount ?? 1,
        urgency: inc.urgency ?? 'Emergency',
        timeReceived: inc.timeReceived || 'Just now',
        status: inc.status ?? 'Pending',
        assignedTeam: inc.assignedTeam ?? null,
        acknowledged: inc.acknowledged ?? false,
        notes: inc.notes || 'Emergency SOS received via RescueNet APK uplink',
        clusterRadiusMeters: inc.clusterRadiusMeters ?? 25,
        clusterMembers: inc.clusterMembers || [
          {
            id: `p-${Date.now()}`,
            name: 'Survivor Node',
            condition: 'SOS broadcasted from Android Survivor App',
            distanceMeters: 0,
            lat: inc.lat ?? 18.5204,
            lon: inc.lon ?? 73.8567,
            battery: 88,
            emergencyNeeds: ['Emergency Assistance'],
          },
        ],
      };
      return {
        sosList: [full, ...state.sosList],
        selectedSosId: full.id,
      };
    });
  },

  resetDemo: () => {
    set({
      currentRole: 'admin',
      adminNav: 'requests',
      rescuerNav: 'cases',
      sosList: INITIAL_SOS_LIST,
      teams: INITIAL_TEAMS,
      selectedSosId: 'SOS #1024',
      selectedPersonId: null,
      rescuerLocation: { lat: 18.5235, lon: 73.8595 },
      navDistanceRemaining: 420,
      navEtaMinutes: 3,
      isNavigating: false,
      rescuerMessages: INITIAL_RESCUER_CHAT,
    });
  },
}));
