import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accelerate, wrapX, bestScore } from './logic.ts';

test('speed grows in its current direction', () => {
  assert.equal(accelerate(200, 1), 700);
  assert.equal(accelerate(-200, 1), -700);
});

test('wraps around both edges', () => {
  assert.equal(wrapX(-16), 410);
  assert.equal(wrapX(419), -18);
  assert.equal(wrapX(200), 200);
});

test('best score handles empty or junk storage', () => {
  assert.equal(bestScore(5, null), 5);
  assert.equal(bestScore(5, 'abc'), 5);
  assert.equal(bestScore(3, '12'), 12);
  assert.equal(bestScore(30, '12'), 30);
});
