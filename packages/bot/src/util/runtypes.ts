import { Reflect } from "runtypes";
import { RuntypeBase } from "runtypes/lib/runtype.js";
import {
  accessNestedProperty,
  accessParentOfNestedProperty,
} from "util/json.js";
import { aOrAn, discordFormat } from "util/string.js";
import { RecursivePartial } from "util/type.js";

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
  if (value === "") {
    return undefined;
  }
  return value;
};

export const getUnderlyingField = (
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
  fields: { [key: string]: RuntypeBase },
  obj: any,
  options: { message: string },
  path: string[] = []
) => {
  let nestedFields = { ...fields };
  for (const k of path) {
    if (!(k in nestedFields)) {
      throw new Error(`${options.message}: ${path.join(".")}`);
    }
    nestedFields = getUnderlyingField(nestedFields, k).fields;
  }
  Object.keys(obj).forEach((k) => {
    if (!(k in nestedFields)) {
      throw new Error(`${options.message}: ${path.concat(k).join(".")}`);
    }
    if (getUnderlyingField(nestedFields, k).tag === "record") {
      throwOnUnknownKey(fields, obj[k], options, path.concat(k));
    }
  });
};

const translate = (s: Reflect["tag"], options?: { useArticle?: boolean }) =>
  s === "boolean"
    ? "true or false"
    : s === "string"
    ? "text"
    : options?.useArticle
    ? aOrAn(s)
    : s;

export const getRuntypeDescription = (
  f: Reflect,
  options?: { omitOptional?: boolean; useArticle?: boolean }
) =>
  f.tag === "optional"
    ? `${options?.omitOptional ? "" : "optional "}${translate(
        f.underlying.tag,
        { useArticle: options?.useArticle }
      )}`
    : translate(f.tag, { useArticle: options?.useArticle });

const definedValueEmoji = "📝";
const newlyDefinedValueEmoji = "🆕";
const definedDefaultValueEmoji = "⚫";

export const recursivePrintRuntype = async <T extends Object>({
  runtype,
  object,
  lastObject,
  defaultValues,
  path: _path,
  lvl = 0,
}: {
  runtype: Reflect;
  object: T;
  lastObject?: T;
  defaultValues: RecursivePartial<T>;
  path: string;
  lvl?: number;
}): Promise<{
  min: string;
  full: string;
}> => {
  let min = "";
  let full = "";

  const record = getRecord(runtype);
  if (!record) {
    return { min, full };
  }

  const indent = !lvl ? "" : `${"  ".repeat(lvl)}`;

  for (const [key, f] of Object.entries(record.fields)) {
    const path = _path ? `${_path}.${key}` : key;
    const prefix = `${indent}- `;
    const nestedRecord = getRecord(f);

    if (nestedRecord && Object.keys(nestedRecord.fields).length > 0) {
      const inner = await recursivePrintRuntype({
        runtype: nestedRecord,
        object,
        lastObject,
        defaultValues,
        path,
        lvl: lvl + 1,
      });
      const printCategory = (contents: string) =>
        (contents
          ? `\n${prefix}${discordFormat(key, {
              underline: true,
            })}:\n${contents}`
          : "") + "\n";
      min += printCategory(inner.min);
      full += printCategory(inner.full);
    } else {
      const lastValue = accessNestedProperty(lastObject, path);
      const vals = accessParentOfNestedProperty(object, path);
      const isPresent = key in vals;

      const nestedDefaults = accessParentOfNestedProperty(defaultValues, path);

      const isDefault = await import("util/config.js").then(
        ({ isDefaultValue }) =>
          isDefaultValue({
            values: vals,
            defaultValues: nestedDefaults,
            path: key,
          })
      );

      const value = accessNestedProperty(object, path);
      if (isPresent && !isDefault) {
        const emoji =
          !lastObject || lastValue === value
            ? definedValueEmoji
            : newlyDefinedValueEmoji;
        const definedValue =
          `${prefix}${emoji} ` +
          `${discordFormat(key, { bold: true })}: ${discordFormat(value, {
            monospace: true,
            bold: true,
          })}` +
          "\n";
        min += definedValue;
        full += definedValue;
      } else {
        full +=
          prefix +
          (isDefault
            ? `️${definedDefaultValueEmoji} ` +
              `${key}: ${discordFormat(value, {
                monospace: true,
              })} ${discordFormat(`(default value)`)}` +
              "\n"
            : `${key} ${discordFormat(`(${getRuntypeDescription(f)})`, {
                italic: true,
              })}` + "\n");
      }
    }
  }

  return { min, full };
};
