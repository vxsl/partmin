import { defineAdvancedConfig, devOptions } from "advanced-config.js";
import { userMention } from "discord.js";
import {
  getCommuteDestinationsSummary,
  getSearchLocationSummary,
} from "discord/commands/location.js";
import { presenceActivities, successColor } from "discord/constants.js";
import {
  discordClient,
  discordIsReady,
  initDiscord,
  shutdownDiscord,
} from "discord/index.js";
import { discordInitRoutine } from "discord/init-routine.js";
import { constructAndSendRichMessage } from "discord/interactive/index.js";
import {
  reinitializeInteractiveListingMessages,
  sendListing,
} from "discord/interactive/listing/index.js";
import { setPresence, startActivity } from "discord/presence.js";
import { discordError, discordSend, discordWarning } from "discord/util.js";
import dotenv from "dotenv-mono";
import { buildDriver } from "driver.js";
import { Listing } from "listing.js";
import persistent from "persistent.js";
import {
  getListingKey,
  preprocessListings,
  decorateAndFilterListings,
} from "process/index.js";
import psList from "ps-list";
import { error as seleniumError, WebDriver } from "selenium-webdriver";
import { Platform, platforms } from "types/platform.js";
import { ifUserConfigIsChanged, isUserConfigChanged } from "util/config.js";
import {
  debugLog,
  debugLogNoDiscord,
  log,
  logNoDiscord,
  verboseLog,
} from "util/log.js";
import { randomWait, tryNTimes, waitSeconds } from "util/misc.js";
import { discordFormat } from "util/string.js";

process.title = "partmin-bot";

dotenv.load();

const PLATFORMS = [
  platforms.fb,
  //  platforms.kijiji
];

let driver: WebDriver | undefined;
export const requireDriver = () => {
  if (!driver) {
    throw new Error("WebDriver is not initialized.");
  }
  return driver;
};

export let shuttingDown = false;

const logBreakIfConfigChanged = async (platform: string) => {
  const res = await isUserConfigChanged();
  if (res) {
    log(`Config change detected, aborting ${platform} retrieval loop`);
  }
  return res;
};

const retrieval = async (platforms: Platform[]) => {
  await ifUserConfigIsChanged(async () => {
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
        () => onSearchParamsChanged() ?? Promise.resolve()
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

    const processListings = async (listings: Listing[]) => {
      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) return; // TODO this used to be a break

      // pre-process listings before per-listing callbacks
      let preprocessedListings: Listing[] = [];
      try {
        preprocessedListings = await preprocessListings(listings);
        if (!preprocessedListings.length) {
          log(`No valid listings found after pre-processing.`);
          return;
        }
        debugLog(
          `Found ${preprocessedListings.length} valid listings that passed pre-processing.`
        );
      } catch (e) {
        if (e instanceof seleniumError.WebDriverError) {
          throw e;
        }
        if (!shuttingDown) {
          discordWarning(
            `Error while pre-processing listings from ${platform}:`,
            e
          );
        }
        return;
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) return; // TODO this used to be a break

      const seen = (await persistent.listings.value()) ?? [];
      const seenKeys = new Set(seen.map(getListingKey));
      const unseen = preprocessedListings.filter(
        (l) => !seenKeys.has(getListingKey(l))
      );
      log(
        `${unseen.length} unseen listing${
          unseen.length !== 1 ? "s" : ""
        } out of ${preprocessedListings.length}.`
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
              .perListing(l)
              ?.then(() =>
                randomWait({ short: true, suppressProgressLog: true })
              );
            if (await logBreakIfConfigChanged(platform)) break;
          }
        } catch (e) {
          if (e instanceof seleniumError.WebDriverError) {
            throw e;
          }
          if (!shuttingDown) {
            discordWarning(
              `Error while visiting listings from ${platform}:`,
              e
            );
          }
        }
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) return; // TODO this used to be a break

      // process listings:
      let validListings: Listing[] = [];
      try {
        validListings = await decorateAndFilterListings(unseen);
      } catch (e) {
        if (e instanceof seleniumError.WebDriverError) {
          throw e;
        }
        if (!shuttingDown) {
          discordWarning(
            `Error while processing listings from ${platform}:`,
            e
          );
        }
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) return; // TODO this used to be a break

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

          log(
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
        await persistent.listings.writeValue([...seen, ...unseen]);
      } catch (e) {
        if (!shuttingDown) {
          discordWarning(
            `Error while sending Discord listing notifications: ${platform}:`,
            e
          );
        }
      }
      log("\n----------------------------------------\n");
    };
    try {
      await tryNTimes(2, async () => {
        await callbacks.main(processListings);
      });
    } catch (e) {
      if (e instanceof seleniumError.WebDriverError) {
        throw e;
      }
      if (!shuttingDown) {
        discordWarning(`Error while visiting ${platform}:`, e);
      }
      continue;
    }
  }
  await randomWait({ setPresence: true });
};

const shutdownWebdriver = async () => {
  debugLogNoDiscord("Closing the browser...");
  if (!driver) {
    debugLogNoDiscord("The browser is already closed.");
    return;
  }
  await driver
    .getAllWindowHandles()
    .catch()
    .then(async (handles) => {
      for (const handle of handles || []) {
        await driver?.switchTo().window(handle);
        debugLogNoDiscord("Closing window:");
        debugLogNoDiscord(handle);
        debugLogNoDiscord(`(url ${await driver?.getCurrentUrl()})`);
        await driver?.close();
        debugLogNoDiscord("Closed window");
      }
    })
    .catch((e) => {
      debugLogNoDiscord("Error closing windows:", e);
    })
    .then(async () => {
      debugLogNoDiscord("Closing the browser...");
      await driver?.quit();
      debugLogNoDiscord("Closed the browser.");
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
    log("Fatal error:");
    log(e, { error: true });
    console.trace();
    await discordError(e);
  } else {
    logNoDiscord("Fatal error:");
    logNoDiscord(e, { error: true });
    console.trace();
  }
  await shutdown();
  process.exit(1);
};

const handleWebDriverError = async (e: unknown) => {
  if (e instanceof seleniumError.WebDriverError) {
    log("Encountered a WebDriverError:");
    log(e);
    log("Restarting the browser...");
    await waitSeconds(10);
    // close the browser:
    await shutdownWebdriver();
    driver = await buildDriver();
  } else {
    throw e;
  }
  return driver;
};

(async () => {
  try {
    await defineAdvancedConfig().then((c) =>
      persistent.advancedConfig.writeValue(c)
    );
    await initDiscord();
    await discordInitRoutine();
    setPresence("launching");
    reinitializeInteractiveListingMessages();
    setPresence("online");
    log("Starting main retrieval loop...");

    const advancedConfig = await persistent.advancedConfig.requireValue();

    if (devOptions.noRetrieval) {
      log("Skipping retrieval loop according to config option.");
      await discordSend(
        `Doing nothing because advanced config option ${discordFormat(
          "development.noRetrieval",
          { monospace: true }
        )} is set.`
      );
      await new Promise(() => {});
      return;
    }

    if (!advancedConfig.botBehaviour?.suppressGreeting) {
      await constructAndSendRichMessage({
        embeds: [
          {
            title: "🚀  Let's go!",
            description: discordFormat(
              `${
                discordClient.user?.id
                  ? userMention(discordClient.user.id)
                  : "partmin"
              } will now continuously send notifications to this channel about new listings that match your search. You can see what it's doing at any given moment by checking its activity status.` +
                "\n\n" +
                discordFormat(await getSearchLocationSummary(), {
                  bold: true,
                }) +
                "\n" +
                (await getCommuteDestinationsSummary())
            ),
            color: successColor,
          },
        ],
      });
    }

    driver = await buildDriver();
    if (!driver) {
      await fatalError("Failed to initialize WebDriver.");
    }

    await tryNTimes(
      2,
      async () => {
        for (const {
          callbacks: { init },
          name: platform,
        } of PLATFORMS) {
          if (!init) continue;
          log(`Running init routine for ${platform}...`);
          await init();
        }
      },
      async (e) => {
        driver = await handleWebDriverError(e);
      }
    );

    let retries = 0;
    while (retries < Infinity) {
      // TODO consider parameterizing retries
      try {
        await retrieval(PLATFORMS);
        retries = 0;
      } catch (e) {
        const ogDriver: WebDriver | undefined = driver;
        driver = await handleWebDriverError(e);
        if (driver === ogDriver) {
          // Don't retry if it was not a WebDriverError or if the driver was not successfully restarted
          throw e;
        }
        log("Retrying retrieval loop after restarting the browser...");
        retries++;
      }
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
