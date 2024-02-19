const sqFtToSqMetersRatio = 0.092903;
export const sqftToSqMeters = (s2: number) => s2 * sqFtToSqMetersRatio;
export const sqMetersToSqft = (m2: number) => m2 / sqFtToSqMetersRatio;
export const acresToSqft = (a: number) => a * 43560;

export const modifyNestedProperty = (
  obj: any,
  _path: string | string[],
  value: any
) => {
  const path = Array.isArray(_path) ? _path : _path.split(".");
  const last = path.pop();
  if (last === undefined) {
    return;
  }
  let result = obj;
  for (const p of path) {
    if (result[p] === undefined) {
      result[p] = {};
    }
    result = result[p];
  }
  result[last] = value;
};

export const accessNestedProperty = (obj: any, _path: string | string[]) => {
  let result = obj;
  const path = Array.isArray(_path)
    ? _path
    : _path.split(".").filter((s) => s !== "");
  for (const p of path) {
    result = result?.[p];
    if (result === undefined) {
      return undefined;
    }
  }
  return result;
};

export const accessParentOfNestedProperty = (
  obj: any,
  _path: string | string[]
) => {
  const path = Array.isArray(_path) ? _path : _path.split(".");
  return accessNestedProperty(obj, path.slice(0, -1));
};

export const findNestedJSONProperty = (
  jsonString: string,
  key: string
): any => {
  const keyIndex = jsonString.indexOf(`"${key}"`);

  if (keyIndex !== -1) {
    let braceCount = 0;
    let startIndex = jsonString.lastIndexOf("{", keyIndex);

    for (let i = startIndex; i < jsonString.length; i++) {
      if (jsonString[i] === "{") {
        braceCount++;
      } else if (jsonString[i] === "}") {
        braceCount--;
      }

      if (braceCount === 0) {
        const endIndex = i + 1;
        const subString = jsonString.substring(startIndex, endIndex);
        const result = JSON.parse(subString);

        return result[key];
      }
    }
  }

  return undefined;
};

export const sanitizeString = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const abbreviateDuration = (input: string) =>
  input
    .trim()
    .replace(/\s+/g, "")
    .replace(/hour(s)?/gi, "h")
    .replace(/minute(s)?/gi, "m")
    .replace(/min(s)?/gi, "m")
    .replace(/second(s)?/gi, "s")
    .replace(/sec(s)?/gi, "s");

export const conditionalSpreads = <T>(
  arrs: [boolean | null | undefined | string | number, Array<T>][]
) => {
  const result: T[] = [];
  for (const [condition, arr] of arrs) {
    if (!!condition) {
      result.push(...arr);
    }
  }
  return result;
};

export const readableSeconds = (s: number) => {
  if (s < 60) {
    return `${s}s`;
  }
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  let str = `${mins}m`;
  if (secs > 0) {
    str += `${secs}s`;
  }
  return str;
};

export const maxEmptyLines = (s: string, n: number) =>
  s.replace(new RegExp("\\n{" + Number(n + 2) + ",}", "g"), "\n".repeat(n + 1));

export const aOrAn = (word: string) =>
  "aeiou".includes(word[0]?.toLowerCase() ?? "") ? `an ${word}` : `a ${word}`;

export interface DiscordFormatOptions {
  monospace?: true;
  bold?: true;
  italic?: true;
  code?: boolean | string;
  quote?: boolean;
  link?: string;
  underline?: boolean;
}
export const discordFormat = (s: string, options?: DiscordFormatOptions) => {
  let v =
    options?.code === true
      ? `\`\`\`${s}\`\`\``
      : options?.code
      ? `\`\`\`${options.code}\n${s}\`\`\``
      : options?.monospace
      ? `\`${s}\``
      : s;
  if (options?.bold) {
    v = `**${v}**`;
  }
  if (options?.italic) {
    v = `*${v}*`;
  }
  if (options?.underline) {
    v = `__${v}__`;
  }
  if (options?.quote) {
    v = `> ${v.replace(/\n/g, "\n> ")}`;
  }
  if (options?.link) {
    v = `[${v}](${options.link})`;
  }
  return v;
};
