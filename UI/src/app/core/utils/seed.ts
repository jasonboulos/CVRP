import { normalizeSeed } from './random';

export function combineSeeds(...values: (string | number)[]): string {
  return normalizeSeed(values.join('-'));
}
