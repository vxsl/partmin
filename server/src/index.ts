import config from "config.js";
import { tmpDir } from "constants.js";
import { sendEmbedWithButtons } from "discord/embed.js";
import { startDiscordBot } from "discord/index.js";
import { discordImportantError } from "discord/util.js";
import dotenv from "dotenv-mono";
import fs from "fs";
import { Item } from "item.js";
import fb from "platforms/fb/index.js";
import kijiji from "platforms/kijiji/index.js";
import {
  excludeItemsOutsideSearchArea,
  processItems,
  withUnseenItems,
} from "process/index.js";
import { Builder, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { Platform } from "types/platform.js";
import { isValidAddress } from "util/geo.js";
import { log, verboseLog } from "util/log.js";
import { randomWait, waitSeconds } from "util/misc.js";

process.title = "partmin";

dotenv.load();

const ops = new chrome.Options();
if (!config.development?.headed) {
  ops.addArguments("--headless");
  ops.addArguments("--disable-gpu");
}
ops.addArguments("--no-sandbox");

const ifConfigChanged = async (callback?: () => void) => {
  const path = `${tmpDir}/configSearchParams.json`;
  const cached = fs.existsSync(path) ? fs.readFileSync(path, "utf-8") : {};
  const cur = JSON.stringify(config.search.params, null, 2);
  let changed = cached !== cur;
  if (changed) {
    await (callback?.() ?? Promise.resolve());
    log("Config change detected.");
    fs.writeFileSync(path, cur);
  }
  return changed;
};

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
          discordImportantError(`Error while visiting ${platform}:`, e);
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
          discordImportantError(
            `Error while processing items from ${platform}:`,
            e
          );
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

const main = async () => {
  for (const address of config.options?.computeDistanceTo ?? []) {
    if (!(await isValidAddress(address))) {
      throw new Error(
        `Invalid address provided to config.options.computeDistanceTo: ${address}`
      );
    }
  }

  let driver, discordClient;
  try {
    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(ops)
      .build();

    driver.manage().setTimeouts({ implicit: 10000 });

    discordClient = await startDiscordBot();

    await runLoop(driver, [fb, kijiji]);
  } catch (e) {
    if (discordClient?.isReady()) {
      discordImportantError("Crashed.", e);
    } else {
      log("Crashed.");
      log(e);
    }
  } finally {
    if (driver) {
      log("Closing the browser...");
      await driver.quit();
    }
  }
};

process.title = "partmin";
main();
