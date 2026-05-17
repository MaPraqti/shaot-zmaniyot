// src/types.ts
export interface GoogleApiConfig {
  clientId: string | null;
  apiKey: string | null;
}

export interface ActiveTimer {
  chapterId: string | null;
  intervalId: number | null;
  startTime: number | null;
  parsha: string;
}

export interface Session {
  id: string;
  start: number;
  end: number;
  duration: number;
  parsha: string;
  status: "open" | "paid";
  type?: "deduction" | "time";
  batchId?: string;
}

export interface Chapter {
  id: string;
  name: string;
  sessions: Session[];
}

export interface Adjustment {
  id: string;
  amount: number;
  reason: string;
  date: number;
  status: "open" | "paid";
  batchId?: string;
}

export interface PaymentBatch {
  id: string;
  name: string;
  date: number;
  amount: number;
  vatEnabled: boolean;
  vatAmount: number;
  actualPaid: number;
  debtAfter: number;
  seconds: number;
  sessionIds: string[];
  adjustmentIds: string[];
}

export interface Project {
  id: string;
  name: string;
  rate: number;
  debt: number;
  vatEnabled?: boolean;
  archived?: boolean;
  chapters: Chapter[];
  paymentBatches: PaymentBatch[];
  adjustments: Adjustment[];
}

export interface Goal {
  type: "daily" | "weekly" | "monthly";
  unit: "money" | "hours";
  value: number;
}

export interface AppData {
  projects: Project[];
  activeProjectId: string | null;
  currentView: "project" | "management";
  activeTimer: ActiveTimer;
  googleApi: GoogleApiConfig;
  lastSyncDate?: number;
  invoiceLogo?: string;
  goal?: Goal;
  // תמיכה לאחור
  dailyGoal?: number;
}
