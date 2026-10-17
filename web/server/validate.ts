// Minimal request-body validation (no extra dependency).

import type { Observation } from '@moon/shared';

export class ValidationError extends Error {}

type Obj = Record<string, unknown>;

export function asObject(body: unknown): Obj {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('le corps doit être un objet JSON');
  return body as Obj;
}

export function str(o: Obj, key: string, opts: { optional: true; max?: number }): string | undefined;
export function str(o: Obj, key: string, opts?: { optional?: false; max?: number }): string;
export function str(o: Obj, key: string, opts: { optional?: boolean; max?: number } = {}) {
  const v = o[key];
  if (v === undefined && opts.optional) return undefined;
  if (typeof v !== 'string' || (!opts.optional && v.trim() === '')) throw new ValidationError(`"${key}" doit être une chaîne non vide`);
  if (v.length > (opts.max ?? 2000)) throw new ValidationError(`"${key}" est trop long`);
  return v;
}

export function nullableStr(o: Obj, key: string): string | null | undefined {
  if (o[key] === null) return null;
  return str(o, key, { optional: true, max: 200 });
}

export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], optional: true): T | undefined;
export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], optional?: false): T;
export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], optional = false) {
  const v = o[key];
  if (v === undefined && optional) return undefined;
  if (!values.includes(v as T)) throw new ValidationError(`"${key}" doit valoir ${values.map((x) => `"${x}"`).join(' | ')}`);
  return v as T;
}

export function strArray(o: Obj, key: string): string[] | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new ValidationError(`"${key}" doit être une liste de chaînes`);
  return v as string[];
}

export function position(o: Obj, key: string): { x: number; y: number } | null | undefined {
  const v = o[key];
  if (v === undefined || v === null) return v as null | undefined;
  const p = v as Obj;
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || !isFinite(p.x) || !isFinite(p.y))
    throw new ValidationError(`"${key}" doit être { x: number, y: number }`);
  return { x: p.x, y: p.y };
}

export function observations(o: Obj, key: string): Observation[] | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new ValidationError(`"${key}" doit être une liste`);
  if (v.length > 50) throw new ValidationError(`"${key}" : 50 observations maximum`);
  return v.map((item, i) => {
    const ob = asObject(item);
    const ts = str(ob, 'timestamp');
    if (isNaN(Date.parse(ts))) throw new ValidationError(`${key}[${i}].timestamp doit être une date ISO`);
    return {
      text: str(ob, 'text'),
      app: str(ob, 'app', { max: 200 }),
      timestamp: ts,
      ...(ob.windowName !== undefined ? { windowName: str(ob, 'windowName', { max: 500 }) } : {}),
    };
  });
}
