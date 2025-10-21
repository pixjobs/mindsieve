// src/types/data.ts
export type Session = {
  id: string;
  owner: { uid?: string; anonId?: string };
  sessionKey: string;       // server-only secret during anon mode
  title?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
};

export type Turn = {
  id: string;               // assistant message id
  sessionId: string;
  ownerUid?: string;
  userQuery: string;
  createdAt: number;
  preview?: string;
  cardCount?: number;
};

export type StudyCard = {
  id: string;
  sessionId: string;
  turnId: string;
  ownerUid?: string;
  topic: string;
  summary: string;
  bullets: string[];
  keyTerms: string[];
  links?: string[];
  sources: { id: number; title: string; arxiv_id?: string }[];
  pinned?: boolean;
  createdAt: number;
  fromQuery?: string;
};
