export type ScenarioType = 'market_crash' | 'earnings_surprise' | 'sector_rotation' | 'individual_stock';

export type NarrativeOption = {
  choice: string; // "A" | "B" | "C"
  action: string;
  outcome: string;
  learning: string;
  lessonTopics: string[];
};

export type NarrativeScenario = {
  title: string;
  setup: string;
  options: NarrativeOption[];
  nextAction: string;
};

// Learn tab's storytelling mode (lesson.tsx) — a straight short story
// illustrating one course's concept, not a decision scenario. Simpler than
// NarrativeScenario on purpose: no branching options, since this is a
// passive lesson-alternative, not the interactive Daily Challenge.
export type TopicStory = {
  title: string;
  paragraphs: string[];
  takeaway: string;
};
