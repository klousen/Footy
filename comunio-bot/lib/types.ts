export type Position = "keeper" | "defender" | "midfielder" | "striker" | string;

export interface Player {
  id: string;
  name: string;
  club: string;
  position: Position;
  status: string; // ACTIVE | INJURED | WEAKENED | ...
  statusInfo?: string;
  marketValue: number;
  lastPoints: number | null;
  totalPoints: number | null;
  purchasePrice?: number | null; // nur Kader
  acquiredAt?: string | null; // nur Kader: Kaufdatum (für die Verkaufssperre)
  onMarket?: boolean; // nur Kader
  askPrice?: number; // nur Transfermarkt: Mindestpreis
  owner?: string; // nur Transfermarkt: Verkäufer (Computer oder Manager)
}

export interface CaData {
  caId: string;
  name: string;
  marketValue: number | null;
  prognose: number | null;
  empfehlung: string | null; // Kaufen | Halten | Verkaufen | ...
  change7dPct: number | null;
  fetchedAt: string;
}

export type RecType = "BUY" | "SELL";
export type RecStatus = "PENDING" | "REJECTED" | "EXECUTED" | "FAILED" | "EXPIRED";

export interface Recommendation {
  id: string;
  type: RecType;
  playerId: string;
  playerName: string;
  club: string;
  position: Position;
  price: number; // Gebot (BUY) bzw. Verkaufspreis (SELL)
  marketValue: number;
  expectedPct: number; // erwartete Marktwertentwicklung über den Horizont, in %
  expectedProfit: number; // BUY: erwarteter Gewinn ggü. Gebot; SELL: vermiedener Verlust
  reasons: string[];
  caPrognose: number | null;
  caEmpfehlung: string | null;
  lastPoints: number | null;
  createdAt: string;
  expiresAt: string;
  status: RecStatus;
  result?: string;
  decidedAt?: string;
}

export interface RunSummary {
  runAt: string;
  credit: number;
  pendingPurchases: number;
  available: number;
  squadValue: number;
  squadSize: number;
  marketSize: number;
  unmapped: string[];
  recIds: string[];
  dry: boolean;
  warnings: string[];
}
