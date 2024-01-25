import dotenv from "dotenv";
import fs from "fs";
import fb from "./fb/index.js";
import kijiji from "./kijiji/index.js";
import {
  Item,
  Platform,
  excludeItemsOutsideSearchArea,
  processItems,
  withUnseenItems,
import { Item } from "types/item.js";
import { Platform } from "types/platform.js";
import {
  discordLog,
  errorLog,
  log,
  randomWait,
  verboseLog,
} from "./util/misc.js";

process.title = "partmin";

dotenv.config();

const config = _config as Config; // TODO don't naively assert here

const ops = new chrome.Options();
if (config.headless) {
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
  for (const { pre } of Object.values(runners)) {
    await (pre?.(config, driver, configChanged) ?? Promise.resolve());
  }
  await fs.promises.writeFile(
    `${tmpDir}/configSearchParams.json`,
    JSON.stringify(config.search.params, null, 2)
  );

  while (true) {
    try {
      for (const [platform, { main, perItem }] of Object.entries(runners)) {
        log(
          `\n=======================================================\n${platform}\n`
        );
        let allItems: Item[] | undefined;
        try {
          allItems = await main(config, driver);
          if (!allItems?.length) {
            log(`Somehow there are no items upon visiting ${platform}.`);
            continue;
          }
        } catch (e) {
          discordLog(`Error while visiting ${platform}:`);
          discordLog(e, { monospace: true });
          continue;
        }

        try {
          const items = excludeItemsOutsideSearchArea(config, allItems);
          if (!items.length) {
            log(`No items found within the search area.`);
            continue;
          }
          verboseLog({ items });

          await withUnseenItems(items, async (unseenItems) => {
            for (const item of unseenItems) {
              await perItem?.(config, driver, item)?.then(() =>
                randomWait({ short: true, suppressLog: true })
              );
            }
            await processItems(config, unseenItems).then((arr) =>
              notify(driver, arr)
            );
          });
        } catch (e) {
          discordLog(`Error while processing items from ${platform}:`);
          discordLog(e, { monospace: true });
        }
        log("\n----------------------------------------\n");
      }
      await randomWait();
    } catch (err) {
      errorLog(err);
      break;
    }
  }
};

const main = async () => {
  let driver, discordClient;
  try {
    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(ops)
      .build();

    driver.manage().setTimeouts({ implicit: 10000 });

    discordClient = await startDiscordBot();

    // await loadCookies(driver);
    await runLoop(driver, [fb, kijiji]);
  } catch (e) {
    if (notifyOnExit) {
      if (discordClient?.isReady()) {
        discordLog("Crashed.");
        discordLog(e);
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
