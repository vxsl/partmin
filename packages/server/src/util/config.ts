import config from "config.js";
import { tmpDir } from "constants.js";
import fs from "fs";
import { isValidAddress } from "util/geo.js";
import { debugLog, log } from "util/log.js";

export const validateConfig = async () => {
  debugLog("Validating config:");
  debugLog(config);
  for (const address of config.options?.computeDistanceTo ?? []) {
    if (!(await isValidAddress(address))) {
      throw new Error(
        `Invalid address provided to config.options.computeDistanceTo: ${address}`
      );
    }
  }
};

export const detectConfigChange = async (
  callback?: (isChanged: boolean) => void
) => {
  const path = `${tmpDir}/config-search-params.json`;
  const cached = fs.existsSync(path)
    ? fs.readFileSync(path, "utf-8")
    : undefined;
  const cur = JSON.stringify(config.search.params, null, 2);
  let v = cached !== cur;
  log(
    v
      ? !cached
        ? "No cached search found."
        : "Change in search parameters detected."
      : "No change in search parameters since last run."
  );
  await (callback ? callback(v) : Promise.resolve());
  if (v) {
    fs.writeFileSync(path, cur);
  }
  return v;
};
