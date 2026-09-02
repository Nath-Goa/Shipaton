export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number; // epoch ms
  isError?: boolean;
};

// "general" is the un-scoped thread; anything else is a stock symbol.
export type ThreadKey = 'general' | string;
