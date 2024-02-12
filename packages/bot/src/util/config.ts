import cache from "cache.js";
import {
  StaticConfig,
  defaultConfigValues,
  unreliabilityExplanations,
} from "config.js";
import { discordFormat, discordWarning } from "discord/util.js";
import { accessNestedProperty } from "util/data.js";
import { isValidAddress } from "util/geo.js";
import { debugLog, log, verboseLog } from "util/log.js";

export const getConfig = async () => await cache.config.requireValue();

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

  const unreliable = JSON.parse(
    JSON.stringify(c.search.params.unreliableParams)
  ) as typeof c.search.params.unreliableParams;
  if (
    c.botBehaviour?.suppressUnreliableParamsWarning ||
    !unreliable ||
    !c.search.params.unreliableParams
  ) {
    return;
  }

  for (const _k of Object.keys(c.search.params.unreliableParams)) {
    const k = _k as keyof typeof c.search.params.unreliableParams;
    if (await isDefaultValue((c) => c.search.params.unreliableParams![k])) {
      delete unreliable[k];
    }
  }

  if (Object.values(unreliable).length) {
    discordWarning(
      `Warning: you have specified ${
        Object.values(unreliable).length > 1
          ? "search parameters that are"
          : "a search parameter that is"
      } prone to false negatives.`,
      `${Object.entries(unreliable)
        .map(
          ([k, v]) =>
            `- ${discordFormat(`"${k}": ${v}`, { monospace: true })}\n> ${
              unreliabilityExplanations[
                k as keyof typeof unreliabilityExplanations
              ]
            }`
        )
        .join("\n")}\n\n${discordFormat(
        "This means that partmin may ignore some desirable listings. Consider removing these parameters from your config.",
        { bold: true }
      )}`
    );
  }
};

export const isConfigChanged = async () => {
  const userFile = await getConfig().then((c) => c.search.params);
  const cached = await cache.currentSearchParams.value();
  if (!cached) {
    log("No previous search parameters found.");
    return true;
  }
  if (JSON.stringify(cached) === JSON.stringify(userFile)) {
    verboseLog("No change in search parameters detected.");
    return false;
  }
  log("Change in search parameters detected.");
  return true;
};

export const ifConfigChanged = async (callback?: () => void) => {
  const userFile = await getConfig().then((c) => c.search.params);
  return isConfigChanged().then(async (changed) => {
    if (changed) {
      await (callback ? callback() : Promise.resolve());
      cache.currentSearchParams.writeValue(userFile);
    }
  });
};
