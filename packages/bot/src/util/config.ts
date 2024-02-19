import cache from "cache.js";
import { discordFormat, discordWarning } from "discord/util.js";
import {
  StaticUserConfig,
  defaultUserConfigValues,
  unreliabilityExplanations,
} from "user-config.js";
import { accessNestedProperty } from "util/data.js";
import { isValidAddress } from "util/geo.js";
import { debugLog, log, verboseLog } from "util/log.js";

export const getUserConfig = async () =>
  await cache.cachedUserConfig.requireValue();

export const isDefaultValue = async (
  path: string | ((config: StaticUserConfig) => any),
  options?: {
    baseNest?: (config: StaticUserConfig) => any;
  }
) => {
  let actual, expected;
  try {
    const config = await getUserConfig();
    const nestedConfig = options?.baseNest ? options.baseNest(config) : config;
    const nestedDefault = options?.baseNest
      ? options.baseNest(defaultUserConfigValues as unknown as StaticUserConfig)
      : (defaultUserConfigValues as unknown as StaticUserConfig);
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

export const dynamicValidateUserConfig = async (c: StaticUserConfig) => {
  debugLog("Validating user config:");
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

  const advancedConfig = await cache.cachedAdvancedConfig.value();

  const unreliable = JSON.parse(
    JSON.stringify(c.search.params.unreliableParams)
  ) as typeof c.search.params.unreliableParams;
  if (
    advancedConfig?.botBehaviour?.suppressUnreliableParamsWarning ||
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

export const isUserConfigChanged = async () => {
  const userFile = await getUserConfig();
  const cached = await cache.userConfig.value();
  if (!cached) {
    log("No previous configuration found.");
    return true;
  }
  if (JSON.stringify(cached) === JSON.stringify(userFile)) {
    verboseLog("No change in configuration detected.");
    return false;
  }
  log("Change in configuration detected.");
  return true;
};

export const ifUserConfigChanged = async (callback?: () => void) => {
  const userFile = await getUserConfig();
  return isUserConfigChanged().then(async (changed) => {
    if (changed) {
      await (callback ? callback() : Promise.resolve());
      cache.userConfig.writeValue(userFile);
    }
  });
};
