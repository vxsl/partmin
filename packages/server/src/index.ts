import { sendEmbedWithButtons } from "discord/embed.js";
import { startDiscordBot } from "discord/index.js";
import { discordError, discordWarning } from "discord/util.js";
import dotenv from "dotenv-mono";
import { buildDriver } from "driver.js";
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
import { ifConfigChanged, validateConfig } from "util/config.js";
import { log, verboseLog } from "util/log.js";
import { randomWait, waitSeconds } from "util/misc.js";

process.title = "partmin";

dotenv.load();

const runLoop = async (driver: WebDriver, runners: Platform[]) => {
  await ifConfigChanged(async () => {
    for (const { pre } of runners) {
      await (pre?.(driver, true) ?? Promise.resolve());
    }
  });

  while (true) {
    try {
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
          verboseLog({ items });

          await withUnseenItems(items, async (unseenItems) => {
            for (const item of unseenItems) {
              await perItem?.(driver, item)?.then(() =>
                randomWait({ short: true, suppressLog: true })
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
    } catch (err) {
      log(err, { error: true });
      break;
    }
  }
};

(async () => {
  let driver, discordClient;
  try {
    discordClient = await startDiscordBot();
    await validateConfig();
    driver = await buildDriver();
    await runLoop(driver, [fb, kijiji]);
  } catch (e) {
    if (discordClient?.isReady()) {
      await discordError(e);
    } else {
      await log("Crashed.");
      await log(e);
    }
  } finally {
    if (driver) {
      log("Closing the browser...");
      await driver.quit();
    }
  }
})();
