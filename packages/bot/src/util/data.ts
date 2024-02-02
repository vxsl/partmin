import config from "config.js";

const sqFtToSqMetersRatio = 0.092903;
export const sqftToSqMeters = (s2: number) => s2 * sqFtToSqMetersRatio;
export const sqMetersToSqft = (m2: number) => m2 / sqFtToSqMetersRatio;
export const acresToSqft = (a: number) => a * 43560;

export const findNestedProperty = (jsonString: string, key: string): any => {
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

const sanitizeString = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const trimAddress = (address: string): string => {
  const city = sanitizeString(config.search.location.city);
  const prov = sanitizeString(config.search.location.region);
  const cityIndex = sanitizeString(address).lastIndexOf(city);
  const provIndex = sanitizeString(address).lastIndexOf(prov);
  if (cityIndex === 0 || provIndex <= cityIndex) {
    return address;
  }
  const result = address.substring(0, cityIndex).trim();
  if (result[result.length - 1] === ",") {
    return result.substring(0, result.length - 1);
  }
  return result;
};

export const mdQuote = (s: string) => `> ${s.replace(/\n/g, "\n> ")}`;

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
