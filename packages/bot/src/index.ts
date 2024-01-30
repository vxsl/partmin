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
import { Item } from "item.js";
import fb from "platforms/fb/index.js";
import kijiji from "platforms/kijiji/index.js";
import {
  excludeItemsOutsideSearchArea,
  processItems,
  withUnseenItems,
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
    for (const { key: platform, main, perItem } of runners) {
      log(
        `\n=======================================================\n${platform}\n`
      );
      let allItems: Item[] | undefined;
      try {
        allItems = await main(driver);
        if (!allItems?.length) {
          log(`Somehow there are no items upon visiting ${platform}.`);
          continue;
        }
      } catch (e) {
        discordWarning(`Error while visiting ${platform}:`, e);
        continue;
      }

      try {
        const items = excludeItemsOutsideSearchArea(allItems);
        if (!items.length) {
          log(`No items found within the search area.`);
          continue;
        }
        debugLog(`Found ${items.length} items within the search area.`);
        verboseLog({ items });

        await withUnseenItems(items, async (unseenItems) => {
          for (const item of unseenItems) {
            await perItem?.(driver, item)?.then(() =>
              randomWait({ short: true, suppressProgressLog: true })
            );
          }
          await processItems(unseenItems).then(async (arr) => {
            for (const item of arr) {
              await sendEmbedWithButtons(item);
              await waitSeconds(0.5);
            }
          });
        });
      } catch (e) {
        discordWarning(`Error while processing items from ${platform}:`, e);
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
    if (!shuttingDown) {
      if (discordClient?.isReady()) {
        await discordError(e);
      } else {
        await log("Crashed.", { skipDiscord: true });
        await log(e, { skipDiscord: true });
      }
    }
  } finally {
    shutdown();
  }
})();

let shuttingDown = false;
const shutdownWebdriver = async () => {
  if (!driver) {
    return;
  }
  log("Closing the browser...");
  try {
    const handles = await driver.getAllWindowHandles();
    for (const handle of handles) {
      console.log("Closing window", handle);
      await driver.switchTo().window(handle);
      console.log(
        "Closing window",
        handle,
        "with URL",
        await driver.getCurrentUrl()
      );
      await driver.close();
      console.log("Closed window");
    }
    await driver.quit();
  } catch (e) {
    console.error("Error while shutting down webdriver:", e);
  }
};
const shutdown = () => {
  if (!shuttingDown) {
    shuttingDown = true;
    console.log("Shutting down...");
    setDiscordPresence("shuttingDown")
      .then(shutdownWebdriver)
      .then(shutdownDiscordBot);
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
