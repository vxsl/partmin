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
  const path = `${tmpDir}/configSearchParams.json`;
  const cached = fs.existsSync(path) ? fs.readFileSync(path, "utf-8") : {};
  const cur = JSON.stringify(config.search.params, null, 2);
  let v = cached !== cur;
  await (callback?.(v) ?? Promise.resolve());
  if (v) {
    log("Config change detected.");
    fs.writeFileSync(path, cur);
  } else {
    log("No config change detected since last run.");
  }
  return v;
};
