import type { QuizQuestion } from '@/types/quiz';

// The hand-written bank keeps the correct answer first because that makes it
// easy to review. Randomize only at delivery time so editing remains simple
// while learners cannot infer the answer from its position.
export function randomizeQuizOptions<T extends QuizQuestion>(question: T): T {
  if (
    question.options.length < 2 ||
    !Number.isInteger(question.correctIndex) ||
    question.correctIndex < 0 ||
    question.correctIndex >= question.options.length
  ) {
    return { ...question, options: [...question.options] };
  }

  const choices = question.options.map((text, originalIndex) => ({ text, originalIndex }));
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }

  return {
    ...question,
    options: choices.map((choice) => choice.text),
    correctIndex: choices.findIndex((choice) => choice.originalIndex === question.correctIndex),
  };
}
