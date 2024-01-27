import config from "config.js";
import { tmpDir } from "constants.js";
import { sendEmbedWithButtons } from "discord/embed.js";
import { startDiscordBot } from "discord/index.js";
import { discordImportantError } from "discord/util.js";
import dotenv from "dotenv";
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

dotenv.config();

const ops = new chrome.Options();
if (!config.development?.headed) {
  ops.addArguments("--headless");
  ops.addArguments("--disable-gpu");
}
ops.addArguments("--no-sandbox");

let notifyOnExit = true;
// process.on("SIGINT", function () {
//   console.error("\n\nCaught interrupt signal");
//   process.exit();
// });

const runLoop = async (driver: WebDriver, runners: Platform[]) => {
  // TODO don't do all this crap
  const tmpDirExists = await fs.promises
    .access(tmpDir)
    .then(() => true)
    .catch(() => false);
  if (!tmpDirExists) {
    await fs.promises.mkdir(tmpDir);
  }
  const configExists = await fs.promises
    .access(`${tmpDir}/configSearchParams.json`)
    .then(() => true)
    .catch(() => false);
  if (!configExists) {
    await fs.promises.writeFile(
      `${tmpDir}/configSearchParams.json`,
      JSON.stringify({})
    );
  }

  const cachedParams = await fs.promises.readFile(
    `${tmpDir}/configSearchParams.json`,
    "utf-8"
  );
  let configChanged =
    cachedParams !== JSON.stringify(config.search.params, null, 2);
  if (configChanged) {
    log("Config change detected.");
  }
  for (const { pre } of runners) {
    await (pre?.(driver, configChanged) ?? Promise.resolve());
  }
  await fs.promises.writeFile(
    `${tmpDir}/configSearchParams.json`,
    JSON.stringify(config.search.params, null, 2)
  );

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

    // driver.manage().setTimeouts({ implicit: 10000 });

    discordClient = await startDiscordBot();

    await runLoop(driver, [fb, kijiji]);
  } catch (e) {
    if (notifyOnExit) {
      if (discordClient?.isReady()) {
        discordImportantError("Crashed.", e);
      } else {
        log("Crashed.");
        log(e);
      }
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
