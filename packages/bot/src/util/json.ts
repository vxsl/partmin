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
