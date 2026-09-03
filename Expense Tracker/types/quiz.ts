export type Difficulty = 'easy' | 'medium' | 'hard';

// Shape the AI is asked to return (questionId is generated locally, not by
// the model, so it's guaranteed unique).
export type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  learningObjective: string;
  followUpTopic: string;
};

export type QuizAttempt = {
  topic: string;
  date: string; // "YYYY-MM-DD"
  score: number; // 0-100
  difficulty: Difficulty;
};

export type TopicProgress = {
  topic: string;
  lastAttemptDate: string;
  lastScore: number;
  consecutiveCorrect: number;
  currentDifficulty: Difficulty;
  nextReviewDate: string;
  mastered: boolean;
};

export type QuizSource = 'bank' | 'ai';

export type QuizHistoryEntry = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number;
  explanation: string;
  difficulty: Difficulty;
  source: QuizSource;
  createdAt: number; // epoch ms
};
