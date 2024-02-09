import cache from "cache.js";
import {
  StaticConfig,
  defaultConfigValues,
  unreliabilityExplanations,
} from "config.js";
import { dataDir } from "constants.js";
import { discordFormat, discordWarning } from "discord/util.js";
import fs from "fs";
import { accessNestedProperty } from "util/data.js";
import { isValidAddress } from "util/geo.js";
import { debugLog, log } from "util/log.js";

export const getConfig = () => cache.config.requireValue();

export const isDefaultValue = async (
  path: string | ((config: StaticConfig) => any),
  options?: {
    baseNest?: (config: StaticConfig) => any;
  }
) => {
  let actual, expected;
  try {
    const config = await getConfig();
    const nestedConfig = options?.baseNest ? options.baseNest(config) : config;
    const nestedDefault = options?.baseNest
      ? options.baseNest(defaultConfigValues as unknown as StaticConfig)
      : (defaultConfigValues as unknown as StaticConfig);
    if (typeof path === "string") {
      actual = accessNestedProperty(nestedConfig, path);
      expected = accessNestedProperty(nestedDefault, path);
    } else {
      actual = path(nestedConfig);
      expected = path(nestedDefault);
    }
  } catch (e) {
    log("Error while checking default value of config option", { error: true });
    log({ actual, expected }, { error: true });
    log(e, { error: true });
    if (actual === undefined && expected === undefined) {
      log("Assuming they are unequal", { error: true });
      return false;
    }
  }
  return actual === expected;
};

export const validateConfig = async (c: StaticConfig) => {
  debugLog("Validating config:");
  debugLog(JSON.stringify(c));
  if (!c.options?.disableGoogleMapsFeatures) {
    for (const address of c.options?.commuteDestinations ?? []) {
      if (!(await isValidAddress(address))) {
        throw new Error(
          `Invalid address provided to config.options.commuteDestinations: ${address}`
        );
      }
    }
  }

  c.search.blacklistRegex?.forEach((r) => {
    try {
      new RegExp(r);
    } catch (e) {
      throw new Error(`Invalid blacklistRegex in config: ${r}`);
    }
  });

  const unreliable = c.search.params.unreliableParams;
  if (c.botBehaviour?.suppressUnreliableParamsWarning || !unreliable) {
    return;
  }
  const unreliableParams = Object.entries(unreliable).filter(
    async ([k]) =>
      !(await isDefaultValue(
        (c) => c.search.params.unreliableParams?.[k as keyof typeof unreliable]
      ))
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
  const config = await getConfig();
  const path = `${dataDir}/config-search-params.json`;
  const cached = fs.existsSync(path)
    ? fs.readFileSync(path, "utf-8")
    : undefined;
  const cur = JSON.stringify(config.search.params, null, 2);
  let v = cached !== cur;
  if (v) {
    log(
      !cached
        ? "No previous search found."
        : "Change in search parameters detected."
    );
    await (callback ? callback() : Promise.resolve());
    fs.writeFileSync(path, cur);
  } else {
    log("No change in search parameters since last run.");
  }
  return v;
};
