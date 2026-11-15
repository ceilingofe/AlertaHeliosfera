import { I18n } from './I18n';

export interface TriviaQuestion {
  id: string;
  q: string;
  options: string[];
  answer: number;
  explain: string;
  source: string;
}

export const TRIVIA_PER_EXAM = 3;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Preguntas del día: rotan por el banco completo sin repetir hasta agotarlo. */
export function questionsForDay(day: number, bank?: TriviaQuestion[]): TriviaQuestion[] {
  const activeBank = bank ?? (I18n.trivia() as TriviaQuestion[]);
  const n = activeBank.length;
  let step = 7;
  while (gcd(step, n) !== 1) step++;
  const out: TriviaQuestion[] = [];
  for (let i = 0; i < TRIVIA_PER_EXAM; i++) {
    out.push(activeBank[((((day - 1) * TRIVIA_PER_EXAM + i) * step) % n + n) % n]);
  }
  return out;
}
