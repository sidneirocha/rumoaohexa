export interface Sticker {
  id: string; // e.g. "BRA1"
  number: string; // e.g. "1"
  teamCode: string; // e.g. "BRA"
  teamName: string;
  group?: string;
  specialSection?: string;
  isSpecial?: boolean;
  variant?: 'bordo' | 'silver' | 'gold' | 'purple';
  imageUrl?: string;
}

export interface Collection {
  [stickerId: string]: number;
}
