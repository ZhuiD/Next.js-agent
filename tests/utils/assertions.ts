import { expect } from 'vitest';

export function expectUrl(value: URL | null): URL {
  expect(value).toBeInstanceOf(URL);
  return value as URL;
}
