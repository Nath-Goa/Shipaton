export type Flashcard = { front: string; back: string };

export type FlashcardSource = 'bank' | 'ai';

export type FlashcardHistoryEntry = {
  id: string;
  front: string;
  back: string;
  source: FlashcardSource;
  createdAt: number; // epoch ms
};
