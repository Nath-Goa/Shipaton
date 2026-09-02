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
