import cache from "cache.js";
import { configDevelopment, initConfig, prevalidateConfig } from "config.js";
import { presenceActivities } from "discord/constants.js";
import { discordIsReady, initDiscord, shutdownDiscord } from "discord/index.js";
import {
  reinitializeInteractiveListingMessages,
  sendListing,
} from "discord/interactive/listing/index.js";
import { setPresence, startActivity } from "discord/presence.js";
import { discordError, discordWarning } from "discord/util.js";
import dotenv from "dotenv-mono";
import { buildDriver } from "driver.js";
import { Listing } from "listing.js";
import {
  getListingKey,
  preprocessListings,
  processListings,
} from "process/index.js";
import psList from "ps-list";
import { WebDriver } from "selenium-webdriver";
import { stdout as singleLineStdOut } from "single-line-log";
import { Platform, platforms } from "types/platform.js";
import {
  ifConfigChanged,
  isConfigChanged,
  validateConfig,
} from "util/config.js";
import { debugLog, log, logNoDiscord, verboseLog } from "util/log.js";
import { randomWait, tryNTimes, waitSeconds } from "util/misc.js";

process.title = "partmin-bot";

dotenv.load();

let driver: WebDriver | undefined;
export let shuttingDown = false;

const logBreakIfConfigChanged = async (platform: string) => {
  const res = await isConfigChanged();
  if (res) {
    log(`Config change detected, aborting ${platform} retrieval loop`);
  }
  return res;
};

const retrieval = async (driver: WebDriver, platforms: Platform[]) => {
  while (true) {
    await ifConfigChanged(async () => {
      for (const {
        callbacks: { onSearchParamsChanged },
        name: platform,
      } of platforms) {
        if (!onSearchParamsChanged) continue;

        const n = 3;
        log(
          `Since the config has changed, running essential preparation for ${platform} retrieval loop.`
        );
        await tryNTimes(
          n,
          () => onSearchParamsChanged(driver) ?? Promise.resolve()
        ).catch((e) => {
          throw new Error(
            `Unable to run essential preparation for ${platform} (tried ${n} times): ${e}`
          );
        });
      }
    });

    for (const {
      name: platform,
      callbacks,
      presenceActivities: presences,
    } of platforms) {
      log(
        `\n=======================================================\n${platform}\n`
      );
      let allListings: Listing[] | undefined;
      try {
        await tryNTimes(2, async () => {
          allListings = await callbacks.main(driver);
        });
      } catch (e) {
        if (!shuttingDown) {
          discordWarning(`Error while visiting ${platform}:`, e);
        }
        continue;
      }
      if (!allListings?.length) {
        discordWarning(
          "Unexpected result",
          `I didn't find any listings on ${platform}. This may mean that ${platform} has changed and I need to be updated. 😞`
        );
        continue;
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) break;

      // pre-process listings before per-listing callbacks
      let listings: Listing[] = [];
      try {
        listings = await preprocessListings(allListings);
        if (!listings.length) {
          log(`No listings found within the search area.`);
          continue;
        }
        debugLog(`Found ${listings.length} listings within the search area.`);
      } catch (e) {
        if (!shuttingDown) {
          discordWarning(
            `Error while pre-processing listings from ${platform}:`,
            e
          );
        }
        continue;
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) break;

      const seen = (await cache.listings.value()) ?? [];
      const seenKeys = new Set(seen.map(getListingKey));
      const unseen = listings.filter((l) => !seenKeys.has(getListingKey(l)));
      log(
        `${unseen.length} unseen listing${
          unseen.length !== 1 ? "s" : ""
        } out of ${listings.length}.}`
      );
      if (unseen.length) {
        verboseLog(unseen.map((l) => l.url).join(", "));
      }

      // per-listing callbacks:
      if (callbacks.perListing) {
        try {
          const activity = startActivity(presences?.perListing, unseen.length);
          for (let i = 0; i < unseen.length; i++) {
            activity?.update(i + 1);
            const l = unseen[i];
            if (!l) continue;

            debugLog(`visiting listing (${i + 1}/${unseen.length}): ${l.url}`);
            await callbacks
              .perListing(driver, l)
              ?.then(() =>
                randomWait({ short: true, suppressProgressLog: true })
              );
            if (await logBreakIfConfigChanged(platform)) break;
          }
        } catch (e) {
          if (!shuttingDown) {
            discordWarning(
              `Error while visiting listings from ${platform}:`,
              e
            );
          }
        }
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) break;

      // process listings:
      let validListings: Listing[] = [];
      try {
        validListings = await processListings(unseen);
      } catch (e) {
        if (!shuttingDown) {
          discordWarning(
            `Error while processing listings from ${platform}:`,
            e
          );
        }
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) break;

      // notify:
      try {
        const activity = startActivity(
          presenceActivities.notifying,
          validListings.length
        );

        let stopDueToConfigChange = false;

        const notificationPromises = validListings.map(async (l, i) => {
          activity?.update(i + 1);
          if (!l) return;

          singleLineStdOut(
            `Sending Discord notification for listing (${i + 1}/${
              validListings.length
            }): ${l.url}`
          );
          try {
            await sendListing(l);
          } catch (e) {
            discordWarning(
              `Error while sending Discord notification for listing ${i + 1}/${
                validListings.length
              }: ${l.url}`,
              e
            );
          }
          if (await logBreakIfConfigChanged(platform)) {
            stopDueToConfigChange = true;
          }
          await waitSeconds(0.5);
        });

        await Promise.all(
          notificationPromises.map((p) =>
            Promise.race([
              p,
              new Promise((_, reject) => {
                if (stopDueToConfigChange) {
                  reject();
                }
              }),
            ])
          )
        );

        // save listings only once all notifications have been sent
        await cache.listings.writeValue([...seen, ...unseen]);
      } catch (e) {
        if (!shuttingDown) {
          discordWarning(
            `Error while sending Discord listing notifications: ${platform}:`,
            e
          );
        }
      }
      log("\n----------------------------------------\n");
    }
    await randomWait({ setPresence: true });
  }
};

const shutdownWebdriver = async () => {
  logNoDiscord("Closing the browser...");
  if (!driver) {
    logNoDiscord("The browser is already closed.");
    return;
  }
  await driver
    .getAllWindowHandles()
    .catch()
    .then(async (handles) => {
      for (const handle of handles || []) {
        await driver?.switchTo().window(handle);
        logNoDiscord("Closing window:");
        logNoDiscord(handle);
        logNoDiscord(`(url ${await driver?.getCurrentUrl()})`);
        await driver?.close();
        logNoDiscord("Closed window");
      }
    })
    .catch((e) => {
      logNoDiscord("Error closing windows:", e);
    })
    .then(async () => {
      logNoDiscord("Closing the browser...");
      await driver?.quit();
      logNoDiscord("Closed the browser.");
    })
    .catch();
};

export const shutdown = async () => {
  let err;
  try {
    if (!shuttingDown) {
      shuttingDown = true;
    } else {
      logNoDiscord("Called shutdown() but already shutting down.");
      return;
    }
    logNoDiscord("Shutting down...");
    await setPresence("shuttingDown", { skipDiscordLog: true });
    await shutdownWebdriver();
    logNoDiscord("Closed the browser.");
    await shutdownDiscord();
    logNoDiscord("Stopped the discord bot.");
    logNoDiscord("Shutdown completed successfully.");
  } catch (e) {
    logNoDiscord("Error during shutdown:", { error: true });
    logNoDiscord(e, { error: true });
    err = e;
  } finally {
    const procs = await psList();
    const auditor = procs.find(
      (proc) => proc.name.startsWith("partmin-presenc") // "partmin-presence-auditor": program names are truncated on Linux and macOS
    );
    if (auditor) {
      logNoDiscord("Sending SIGINT to partmin-presence-auditor.");
      process.kill(auditor.pid, "SIGINT");
    } else {
      logNoDiscord(
        "Tried to send SIGINT to partmin-presence-auditor but it's not running."
      );
    }
    process.exit(err ? 1 : 0);
  }
};

export const fatalError = async (e: unknown) => {
  if (discordIsReady()) {
    await discordError(e);
  } else {
    log(e, { error: true });
  }
  await shutdown();
  process.exit(1);
};

(async () => {
  try {
    const config = await initConfig();

    if (config?.options?.disableGoogleMapsFeatures) {
      log(
        "Google Maps features are disabled. You can enable them by removing the 'options.disableGoogleMapsFeatures' config option."
      );
    } else {
      await cache.googleMapsAPIKey.requireValue({
        message: `A Google Maps API key with permissions for the Geocoding and Distance Matrix APIs is required for some partmin features. ${cache.googleMapsAPIKey.envVarInstruction}\n\nYou may disable these features by setting the 'options.disableGoogleMapsFeatures' config option.`,
      });
    }

    await initDiscord();
    setPresence("launching");
    reinitializeInteractiveListingMessages();
    driver = await buildDriver();

    setPresence("online");
    prevalidateConfig(config);
    validateConfig(config);

    if (!configDevelopment.noRetrieval) {
      await retrieval(driver, [platforms.fb, platforms.kijiji]);
    } else {
      log("Skipping retrieval loop according to config option.");
      await new Promise(() => {});
    }
  } catch (e) {
    if (shuttingDown) {
      log("Caught error during shutdown:");
      log(e);
      return;
    }
    await fatalError(e);
  } finally {
    shutdown();
  }
})();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
