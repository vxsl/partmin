import config, { isDefaultValue, unreliabilityExplanations } from "config.js";
import { dataDir } from "constants.js";
import { discordFormat, discordWarning } from "discord/util.js";
import fs from "fs";
import { isValidAddress } from "util/geo.js";
import { debugLog, log } from "util/log.js";

export const validateConfig = async () => {
  debugLog("Validating config:");
  debugLog(JSON.stringify(config));
  if (!config.options?.disableGoogleMapsFeatures) {
    for (const address of config.options?.commuteDestinations ?? []) {
      if (!(await isValidAddress(address))) {
        throw new Error(
          `Invalid address provided to config.options.commuteDestinations: ${address}`
        );
      }
    }
  }

  config.search.blacklistRegex?.forEach((r) => {
    try {
      new RegExp(r);
    } catch (e) {
      throw new Error(`Invalid blacklistRegex in config: ${r}`);
    }
  });

  const unreliable = config.search.params.unreliableParams;
  if (config.botBehaviour?.suppressUnreliableParamsWarning || !unreliable) {
    return;
  }
  const unreliableParams = Object.entries(unreliable).filter(
    ([k, v]) =>
      !isDefaultValue(
        (c) => c.search.params.unreliableParams?.[k as keyof typeof unreliable]
      )
  ) as [keyof typeof unreliabilityExplanations, boolean][] | never;
  if (unreliableParams.length) {
    discordWarning(
      `Warning: you have specified ${
        unreliableParams.length > 1
          ? "search parameters that are"
          : "a search parameter that is"
      } prone to false negatives.`,
      `${unreliableParams
        .map(
          ([k, v]) =>
            `- ${discordFormat(`"${k}": ${v}`, { monospace: true })}\n> ${
              unreliabilityExplanations[k]
            }`
        )
        .join("\n")}\n\n${discordFormat(
        "This means that partmin may ignore some desirable listings. Consider removing these parameters from your config.",
        { bold: true }
      )}`
    );
  }
};

export const detectConfigChange = async (callback?: () => void) => {
  const path = `${dataDir}/config-search-params.json`;
  const cached = fs.existsSync(path)
    ? fs.readFileSync(path, "utf-8")
    : undefined;
  const cur = JSON.stringify(config.search.params, null, 2);
  let v = cached !== cur;
  if (v) {
    log(
      !cached
        ? "No cached search found."
        : "Change in search parameters detected."
    );
    await (callback ? callback() : Promise.resolve());
    fs.writeFileSync(path, cur);
  } else {
    log("No change in search parameters since last run.");
  }
  return v;
};
