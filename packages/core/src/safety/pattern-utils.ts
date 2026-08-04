export interface NamedPattern {
  label: string;
  pattern: RegExp;
}

/** Returns the labels of every pattern that matches, for the safety audit trail. */
export function matchAll(normalized: string, patterns: NamedPattern[]): string[] {
  return patterns.filter((p) => p.pattern.test(normalized)).map((p) => p.label);
}
