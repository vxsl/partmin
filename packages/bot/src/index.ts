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
  ensureSearchChannels,
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
import type { Page } from "playwright";
import {
  ResolvedSearch,
  enabledPlatforms,
  getSearchPersistent,
  getSearches,
  setCurrentSearch,
} from "search.js";
import { platforms } from "types/platform.js";
import { isPlaywrightBrowserError } from "util/browser.js";
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

let page: Page | undefined;
export const requirePage = () => {
  if (!page) {
    throw new Error("Browser page is not initialized.");
  }
  return page;
};

export let shuttingDown = false;

const logBreakIfConfigChanged = async (platform: string) => {
  const res = await isUserConfigChanged();
  if (res) {
    log(`Config change detected, aborting ${platform} retrieval loop`);
  }
  return res;
};

// A config change invalidates whatever the platforms have set up for the
// previous criteria, so this runs once per pass over all the searches rather
// than once per search.
const prepareForConfigChange = () =>
  ifUserConfigIsChanged(async () => {
    for (const platform of enabledPlatforms) {
      const {
        callbacks: { onSearchParamsChanged },
        name,
      } = platforms[platform];
      if (!onSearchParamsChanged) continue;

      const n = 3;
      log(
        `Since the config has changed, running essential preparation for ${name} retrieval loop.`
      );
      await tryNTimes(
        n,
        () => onSearchParamsChanged() ?? Promise.resolve()
      ).catch((e) => {
        throw new Error(
          `Unable to run essential preparation for ${name} (tried ${n} times): ${e}`
        );
      });
    }
  });

const retrieval = async (search: ResolvedSearch) => {
  // Everything the platforms, filters and embeds read about the search comes
  // from here.
  setCurrentSearch(search);
  const { listings: seenListings, ignore } = getSearchPersistent(search);

  log(
    `\n#######################################################\nsearch: ${
      search.name
    } (${search.platforms.join(", ") || "no platforms"})\n`
  );

  for (const {
    name: platform,
    callbacks,
    presenceActivities: presences,
  } of search.platforms.map((k) => platforms[k])) {
    log(
      `\n=======================================================\n${platform}\n`
    );

    const processListings = async (listings: Listing[]) => {
      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) return; // TODO this used to be a break

      // pre-process listings before per-listing callbacks
      let preprocessedListings: Listing[] = [];
      try {
        preprocessedListings = await preprocessListings(listings, ignore);
        if (!preprocessedListings.length) {
          log(`No valid listings found after pre-processing.`);
          return;
        }
        debugLog(
          `Found ${preprocessedListings.length} valid listings that passed pre-processing.`
        );
      } catch (e) {
        if (isPlaywrightBrowserError(e)) {
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

      const seen = (await seenListings.value()) ?? [];
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
        const activity = startActivity(presences?.perListing, unseen.length);
        const failures: string[] = [];
        for (let i = 0; i < unseen.length; i++) {
          activity?.update(i + 1);
          const l = unseen[i];
          if (!l) continue;

          debugLog(`visiting listing (${i + 1}/${unseen.length}): ${l.url}`);
          // Per listing, not per batch: a single unparseable listing used to
          // abort the loop, leaving every listing behind it unvisited — and so
          // unfiltered, since the filters depend on what this callback fetches.
          try {
            await callbacks
              .perListing(l)
              ?.then(() =>
                randomWait({ short: true, suppressProgressLog: true })
              );
          } catch (e) {
            if (isPlaywrightBrowserError(e)) {
              throw e;
            }
            log(`Error while visiting ${l.url}:`, { error: true });
            log(e, { error: true });
            failures.push(l.url);
          }
          if (await logBreakIfConfigChanged(platform)) break;
        }
        if (failures.length && !shuttingDown) {
          discordWarning(
            `Couldn't retrieve details for ${
              failures.length
            } ${platform} listing${failures.length === 1 ? "" : "s"}:`,
            failures.join("\n")
          );
        }
      }

      // abort if config changed:
      if (await logBreakIfConfigChanged(platform)) return; // TODO this used to be a break

      // process listings:
      let validListings: Listing[] = [];
      try {
        validListings = await decorateAndFilterListings(unseen);
      } catch (e) {
        if (isPlaywrightBrowserError(e)) {
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
            await sendListing(l, { channel: search.channelKey });
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
        await seenListings.writeValue([...seen, ...unseen]);
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
      if (isPlaywrightBrowserError(e)) {
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

const shutdownBrowser = async () => {
  debugLogNoDiscord("Closing the browser...");
  if (!page) {
    debugLogNoDiscord("The browser is already closed.");
    return;
  }
  await page
    ?.context()
    .browser()
    ?.close()
    .catch(() => {});
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
    await shutdownBrowser();
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

const handleBrowserError = async (e: unknown) => {
  if (isPlaywrightBrowserError(e)) {
    log("Encountered a browser error:");
    log(e);
    log("Restarting the browser...");
    await waitSeconds(10);
    // close the browser:
    await shutdownBrowser();
    page = await buildDriver();
  } else {
    throw e;
  }
  return page;
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

    page = await buildDriver();
    if (!page) {
      await fatalError("Failed to initialize browser.");
    }

    // Platform init happens once, so it has to cover everything any of the
    // configured searches will ask for.
    const platformsToInit = [
      ...new Set((await getSearches()).flatMap((s) => s.platforms)),
    ].map((k) => platforms[k]);

    await tryNTimes(
      2,
      async () => {
        for (const {
          callbacks: { init },
          name: platform,
        } of platformsToInit) {
          if (!init) continue;
          log(`Running init routine for ${platform}...`);
          await init();
        }
      },
      async (e) => {
        page = await handleBrowserError(e);
      }
    );

    let retries = 0;
    while (retries < Infinity) {
      // TODO consider parameterizing retries
      try {
        await prepareForConfigChange();
        // Re-resolved every pass so that config edits take effect without a
        // restart, the same way search parameters always have.
        const searches = await getSearches();
        await ensureSearchChannels(searches.map((s) => s.name));
        for (const search of searches) {
          await retrieval(search);
        }
        retries = 0;
      } catch (e) {
        const ogPage: Page | undefined = page;
        page = await handleBrowserError(e);
        if (page === ogPage) {
          // Don't retry if it was not a browser error or if the page was not successfully restarted
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
