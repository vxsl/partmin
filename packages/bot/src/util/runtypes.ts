import { Reflect } from "runtypes";

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
