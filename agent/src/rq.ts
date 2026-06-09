import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";

type RqState = {
  accounts: Record<string, {lastRq: string}>;
};

export function seedRqFromLfr(lfr: bigint | number | string): bigint {
  const parsed = BigInt(lfr);
  if (parsed < 0n) throw new Error("lfr must be non-negative");
  return parsed;
}

export function nextRq(input: {statePath: string; accountKey: string; lfr?: bigint | number | string}): bigint {
  const state = readState(input.statePath);
  const seeded = input.lfr === undefined ? 0n : seedRqFromLfr(input.lfr);
  const last = state.accounts[input.accountKey]?.lastRq;
  const lastRq = last === undefined ? seeded : maxBigInt(BigInt(last), seeded);
  const rq = lastRq + 1n;

  state.accounts[input.accountKey] = {lastRq: rq.toString()};
  writeState(input.statePath, state);
  return rq;
}

function readState(path: string): RqState {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RqState;
  } catch {
    return {accounts: {}};
  }
}

function writeState(path: string, state: RqState): void {
  mkdirSync(dirname(path), {recursive: true});
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmpPath, path);
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}
