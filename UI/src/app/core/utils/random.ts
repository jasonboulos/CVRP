export type SeedValue = number | string;

const UINT32_MAX = 0xffffffff;

function hashSeed(seed: SeedValue): number {
  if (typeof seed === 'number') {
    return Math.abs(Math.floor(seed)) % UINT32_MAX;
  }

  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededRng {
  next(): number;
  nextInt(maxExclusive: number): number;
  nextRange(min: number, max: number): number;
  pick<T>(values: T[]): T;
  shuffle<T>(values: T[]): T[];
}

export function createSeededRng(seed: SeedValue): SeededRng {
  const normalized = hashSeed(seed);
  const generator = mulberry32(normalized || 1);

  return {
    next(): number {
      return generator();
    },
    nextInt(maxExclusive: number): number {
      return Math.floor(generator() * maxExclusive);
    },
    nextRange(min: number, max: number): number {
      return generator() * (max - min) + min;
    },
    pick<T>(values: T[]): T {
      return values[this.nextInt(values.length)];
    },
    shuffle<T>(values: T[]): T[] {
      const clone = [...values];
      for (let i = clone.length - 1; i > 0; i -= 1) {
        const j = Math.floor(generator() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
      }
      return clone;
    },
  };
}

export function normalizeSeed(seed?: SeedValue): string {
  if (seed === undefined || seed === null) {
    return `${Date.now()}`;
  }
  return String(seed);
}
