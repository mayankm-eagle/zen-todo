const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "three tasks", "one task", "42 tasks". */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  const w = n < WORDS.length ? WORDS[n] : String(n);
  return `${w} ${n === 1 ? noun : plural}`;
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
