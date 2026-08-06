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

export const accessNestedProperty = (
  obj: any,
  _path: string | string[] | undefined
) => {
  if (_path === undefined) {
    return obj;
  }
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

/**
 * Every balanced JSON object in the string that encloses the given key.
 *
 * findNestedJSONProperty only ever looks at the nearest enclosing brace, which
 * lands on whichever small fragment happens to sit closest to the key. This
 * walks outward instead, collecting each successively larger object that still
 * parses, so a caller can pick whichever one actually holds the fields it needs.
 */
export const findEnclosingJSONObjects = (
  jsonString: string,
  key: string,
  options?: { maxResults?: number; maxOutwardSteps?: number }
): any[] => {
  const maxResults = options?.maxResults ?? 300;
  const maxOutwardSteps = options?.maxOutwardSteps ?? 30;
  const needle = `"${key}"`;
  const results: any[] = [];

  let keyIndex = jsonString.indexOf(needle);
  while (keyIndex !== -1 && results.length < maxResults) {
    let from = keyIndex;
    for (let step = 0; step < maxOutwardSteps; step++) {
      from = jsonString.lastIndexOf("{", from - 1);
      if (from < 0) {
        break;
      }
      let depth = 0;
      for (let i = from; i < jsonString.length; i++) {
        const c = jsonString[i];
        if (c === "{") {
          depth++;
        } else if (c === "}") {
          depth--;
        }
        if (depth === 0) {
          // An object that closes before the key doesn't contain it:
          if (i >= keyIndex) {
            try {
              results.push(JSON.parse(jsonString.substring(from, i + 1)));
            } catch {
              // not valid JSON on its own; a wider object may still parse
            }
          }
          break;
        }
      }
    }
    keyIndex = jsonString.indexOf(needle, keyIndex + 1);
  }

  return results;
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
