import { puppeteerCacheDir, tmpDir } from "constants.js";
import { sendEmbedWithButtons } from "discord/embed.js";
import { startDiscordBot } from "discord/index.js";
import {
  discordClient,
  setDiscordPresence,
  shutdownDiscordBot,
} from "discord/client.js";
import { discordError, discordWarning } from "discord/util.js";
import dotenv from "dotenv-mono";
import { buildDriver } from "driver.js";
import fs from "fs";
import { Listing } from "listing.js";
import fb from "platforms/fb/index.js";
import kijiji from "platforms/kijiji/index.js";
import {
  excludeListingsOutsideSearchArea,
  processListings,
  withUnseenListings,
} from "process/index.js";
import { WebDriver } from "selenium-webdriver";
import { Platform } from "types/platform.js";
import { detectConfigChange, validateConfig } from "util/config.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { randomWait, waitSeconds } from "util/misc.js";

process.title = "partmin-bot";

dotenv.load();

const runLoop = async (driver: WebDriver, runners: Platform[]) => {
  await detectConfigChange(async (isChanged) => {
    for (const { prepare, key } of runners) {
      try {
        await (prepare?.(driver, isChanged) ?? Promise.resolve());
      } catch (e) {
        throw new Error(
          `Error while running preparation callback for ${key}: ${e}`
        );
      }
    }
  });

  while (true) {
    for (const { key: platform, main, perListing } of runners) {
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
        verboseLog({ listings });

        await withUnseenListings(listings, async (unseenListings) => {
          for (const l of unseenListings) {
            await perListing?.(driver, l)?.then(() =>
              randomWait({ short: true, suppressProgressLog: true })
            );
          }
          await processListings(unseenListings).then(async (unseen) => {
            for (const l of unseen) {
              await sendEmbedWithButtons(l);
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

let driver: WebDriver | undefined;

(async () => {
  try {
    [tmpDir, puppeteerCacheDir].forEach(
      (dir) => !fs.existsSync(dir) && fs.mkdirSync(dir)
    );

    log("Initializing discord bot...", { skipDiscord: true });
    await startDiscordBot();
    await setDiscordPresence("launching");
    await validateConfig();
    driver = await buildDriver();

    await setDiscordPresence("online");
    await runLoop(driver, [fb, kijiji]);
  } catch (e) {
    if (shuttingDown) {
      log("Caught error during shutdown:");
      log(e);
      return;
    }
    if (discordClient?.isReady()) {
      await discordError(e);
    } else {
      await log("Crashed.", { skipDiscord: true });
      await log(e, { skipDiscord: true });
    }
  } finally {
    shutdown();
  }
})();

let shuttingDown = false;

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
        await driver.switchTo().window(handle);
        log("Closing window:");
        log(handle);
        log(`(url ${await driver.getCurrentUrl()})`);
        await driver.close();
        log("Closed window");
      }
    })
    .catch((e) => {
      log("Error closing windows:", e);
    })
    .then(async () => {
      log("Closing the browser...");
      await driver.quit();
      log("Closed the browser.");
    })
    .catch((e) => {
      log("Error calling driver.quit():", e);
    });
};

const shutdown = async () => {
  try {
    if (shuttingDown) {
      log("Called shutdown() but already shutting down.");
      return;
    }
    shuttingDown = true;
    log("Shutting down...");
    await setDiscordPresence("shuttingDown");
    await shutdownWebdriver();
    log("Closed the browser.");
    await shutdownDiscordBot();
    log("Stopped the discord bot.", { skipDiscord: true });
    log("Shutdown completed successfully.", { skipDiscord: true });
    process.exit(0);
  } catch (e) {
    console.error("Error during shutdown:", e);
    process.exit(1);
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
