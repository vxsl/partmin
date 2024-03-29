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
  processListings,
} from "process/index.js";
import psList from "ps-list";
import { WebDriver } from "selenium-webdriver";
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

let driver: WebDriver | undefined;
export let shuttingDown = false;

const logBreakIfConfigChanged = async (platform: string) => {
  const res = await isUserConfigChanged();
  if (res) {
    log(`Config change detected, aborting ${platform} retrieval loop`);
  }
  return res;
};

const retrieval = async (driver: WebDriver, platforms: Platform[]) => {
  while (true) {
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
          log(`No valid listings found after pre-processing.`);
          continue;
        }
        debugLog(
          `Found ${listings.length} valid listings that passed pre-processing.`
        );
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

      const seen = (await persistent.listings.value()) ?? [];
      const seenKeys = new Set(seen.map(getListingKey));
      const unseen = listings.filter((l) => !seenKeys.has(getListingKey(l)));
      log(
        `${unseen.length} unseen listing${
          unseen.length !== 1 ? "s" : ""
        } out of ${listings.length}.`
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
    }
    await randomWait({ setPresence: true });
  }
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

(async () => {
  try {
    await defineAdvancedConfig().then((c) =>
      persistent.advancedConfig.writeValue(c)
    );
    await initDiscord();
    await discordInitRoutine();
    setPresence("launching");
    reinitializeInteractiveListingMessages();
    driver = await buildDriver();
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
    await retrieval(driver, [platforms.fb, platforms.kijiji]);
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
