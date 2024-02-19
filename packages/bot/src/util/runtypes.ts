import { Reflect } from "runtypes";
import { RuntypeBase } from "runtypes/lib/runtype.js";

export const getRecord = (r: Reflect) =>
  r.tag === "record"
    ? r
    : r.tag === "optional" && r.underlying.tag === "record"
    ? r.underlying
    : null;

export const traverseRuntype = (runtype: Reflect, path: string[]): Reflect => {
  let target = runtype;
  for (const p of path) {
    if (target.tag === "record") {
      const f = target.fields[p];
      if (f) {
        target = f;
      }
    } else if (
      target.tag === "optional" &&
      target.underlying.tag === "record"
    ) {
      const f = target.underlying.fields[p];
      if (f) {
        target = f;
      }
    }
  }
  return target;
};

export const castStringToRuntype = (runtype: Reflect, value: string) => {
  const tag = runtype.tag === "optional" ? runtype.underlying.tag : runtype.tag;
  if (tag === "number") {
    const n = parseFloat(value);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  if (tag === "boolean") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return value;
};

const getUnderlyingField = (
  fields: { [key: string]: RuntypeBase },
  k: keyof typeof fields
) =>
  "underlying" in (fields[k] ?? {})
    ? // At the time of writing there doesn't seem to be a clean way to get
      // the underlying type of a Runtype, agnostic of whether it's optional:
      // @ts-ignore
      fields[k].underlying
    : fields[k];

export const throwOnUnknownKey = (
  obj: any,
  fields: { [key: string]: RuntypeBase },
  path: string[] = []
) => {
  for (const k of path) {
    if (!(k in fields)) {
      throw new Error(`Unexpected config option ${path.join(".")}`);
    }
    fields = getUnderlyingField(fields, k).fields;
  }
  const expectedKeys = Object.keys(fields);
  Object.keys(obj).forEach((k) => {
    if (!expectedKeys.includes(k) || !(k in fields)) {
      throw new Error(`Unexpected config option ${path.concat(k).join(".")}`);
    }
    if (getUnderlyingField(fields, k).tag === "record") {
      throwOnUnknownKey(obj[k], fields, path.concat(k));
    }
  });
};
