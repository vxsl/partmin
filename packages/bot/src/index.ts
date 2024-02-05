import cache from "cache.js";
import config from "config.js";
import { dataDir, puppeteerCacheDir } from "constants.js";
import { setDiscordPresence, shutdownDiscordBot } from "discord/client.js";
import {
  reinitializeCollectors,
  sendListing as sendListing,
} from "discord/embed.js";
import {
  discordIsReady,
  initDiscord,
  writeStatusForAuditor,
} from "discord/index.js";
import { discordError, discordWarning } from "discord/util.js";
import dotenv from "dotenv-mono";
import { buildDriver } from "driver.js";
import fs from "fs";
import { Listing } from "listing.js";
import {
  excludeListingsOutsideSearchArea,
  processListings,
  withUnseenListings,
} from "process/index.js";
import psList from "ps-list";
import { WebDriver } from "selenium-webdriver";
import { stdout as singleLineStdOut } from "single-line-log";
import { Platform, platforms } from "types/platform.js";
import { detectConfigChange, validateConfig } from "util/config.js";
import { debugLog, log, logNoDiscord, verboseLog } from "util/log.js";
import { randomWait, tryNTimes, waitSeconds } from "util/misc.js";

process.title = "partmin-bot";

dotenv.load();

let driver: WebDriver | undefined;
export let shuttingDown = false;

const runLoop = async (driver: WebDriver, platforms: Platform[]) => {
  await detectConfigChange(async () => {
    for (const { onSearchParamsChanged, name: platform } of platforms) {
      if (onSearchParamsChanged) {
        const n = 3;
        log(`Running preparation for ${platform}.`);
        await tryNTimes(
          n,
          () => onSearchParamsChanged(driver) ?? Promise.resolve()
        ).catch((e) => {
          throw new Error(
            `Unable to run essential preparation for ${platform} (tried ${n} times): ${e}`
          );
        });
      }
    }
  });

  while (true) {
    for (const { name: platform, main, perListing } of platforms) {
      log(
        `\n=======================================================\n${platform}\n`
      );
      let allListings: Listing[] | undefined;
      try {
        allListings = await main(driver);
        if (!allListings?.length) {
          log(`Somehow there are no listings upon visiting ${platform}.`);
          continue;
        }
      } catch (e) {
        if (!shuttingDown) {
          discordWarning(`Error while visiting ${platform}:`, e);
        }
        continue;
      }

      try {
        const listings = excludeListingsOutsideSearchArea(allListings);
        if (!listings.length) {
          log(`No listings found within the search area.`);
          continue;
        }
        debugLog(`Found ${listings.length} listings within the search area.`);
        verboseLog(listings.map((l) => l.url).join(", "));

        await withUnseenListings(listings, async (unseenListings) => {
          if (perListing) {
            for (let i = 0; i < unseenListings.length; i++) {
              const l = unseenListings[i];
              debugLog(
                `visiting listing (${i + 1}/${unseenListings.length}): ${l.url}`
              );
              await perListing(driver, l)?.then(() =>
                randomWait({ short: true, suppressProgressLog: true })
              );
            }
          }
          await processListings(unseenListings).then(async (valid) => {
            for (let i = 0; i < valid.length; i++) {
              const l = valid[i];
              singleLineStdOut(
                `Sending Discord embed for listing (${i + 1}/${
                  valid.length
                }): ${l.url}`
              );
              try {
                await sendListing(l);
              } catch (e) {
                discordWarning(
                  `Error while sending Discord embed for listing ${i + 1}/${
                    valid.length
                  }: ${l.url}`,
                  e
                );
              }
              await waitSeconds(0.5);
            }
          });
        });
      } catch (e) {
        if (!shuttingDown) {
          discordWarning(
            `Error while processing listings from ${platform}:`,
            e
          );
        }
      }
      log("\n----------------------------------------\n");
    }
    await randomWait();
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

export const shutdown = async () => {
  let err;
  try {
    if (!shuttingDown) {
      shuttingDown = true;
    } else {
      log("Called shutdown() but already shutting down.");
      return;
    }
    log("Shutting down...");
    await setDiscordPresence("shuttingDown", { skipDiscordLog: true });
    await shutdownWebdriver();
    log("Closed the browser.");
    await shutdownDiscordBot();
    logNoDiscord("Stopped the discord bot.");
    logNoDiscord("Shutdown completed successfully.");
  } catch (e) {
    log("Error during shutdown:", { error: true });
    log(e, { error: true });
    err = e;
  } finally {
    const procs = await psList();
    const auditor = procs.find(
      (proc) => proc.name.startsWith("partmin-presenc") // "partmin-presence-auditor": program names are truncated on Linux and macOS
    );
    if (auditor) {
      debugLog("Sending SIGINT to partmin-presence-auditor.");
      process.kill(auditor.pid, "SIGINT");
    } else {
      log(
        "Tried to send SIGINT to partmin-presence-auditor but it's not running."
      );
    }
    process.exit(err ? 1 : 0);
  }
};

(async () => {
  try {
    [dataDir, puppeteerCacheDir].forEach(
      (dir) => !fs.existsSync(dir) && fs.mkdirSync(dir)
    );

    if (!config.options?.disableGoogleMapsFeatures) {
      await cache.googleMapsAPIKey.requireValue({
        message: `A Google Maps API key with permissions for the Geocoding and Distance Matrix APIs is required for some partmin features. ${cache.discordGuildID.envVarInstruction}\n\nYou may disable these features by setting the 'options.disableGoogleMapsFeatures' config option.`,
      });
    }

    await initDiscord();
    writeStatusForAuditor("logged-in");
    log("Bot initialized.");
    setDiscordPresence("launching");
    await reinitializeCollectors();
    await validateConfig();
    driver = await buildDriver();

    setDiscordPresence("online");
    await runLoop(driver, [platforms.fb, platforms.kijiji]);
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

const shutdownWebdriver = async () => {
  log("Closing the browser...");
  if (!driver) {
    log("The browser is already closed.");
    return;
  }
  await driver
    .getAllWindowHandles()
    .catch((e) => {
      log("Error getting window handles:");
      log(e);
    })
    .then(async (handles) => {
      for (const handle of handles || []) {
        await driver?.switchTo().window(handle);
        log("Closing window:");
        log(handle);
        log(`(url ${await driver?.getCurrentUrl()})`);
        await driver?.close();
        log("Closed window");
      }
    })
    .catch((e) => {
      log("Error closing windows:", e);
    })
    .then(async () => {
      log("Closing the browser...");
      await driver?.quit();
      log("Closed the browser.");
    })
    .catch((e) => {
      log("Error calling driver.quit():", e);
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
