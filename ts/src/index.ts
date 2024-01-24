import dotenv from "dotenv";
import { Builder, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { Config } from "types/config.js";
import _config from "../../config.json" assert { type: "json" };
import { fbMain, fbPerItem } from "./fb/index.js";
import { kijijiMain, kijijiPerItem, kijijiPre } from "./kijiji/index.js";
import { notify } from "./notify.js";
import { Item, Platform, processItems, withUnseenItems } from "./process.js";
import {
  discordLog,
  errorLog,
  log,
  randomWait,
  verboseLog,
} from "./util/misc.js";
import { startDiscordBot } from "./notifications/discord/index.js";
import { tmpDir } from "./constants.js";
import fs from "fs";

process.title = "partmin";

dotenv.config();

const config = _config as Config; // TODO don't naively assert here

const headless = false;

const ops = new chrome.Options();
if (headless) {
  ops.addArguments("--headless");
  ops.addArguments("--disable-gpu");
}
ops.addArguments("--no-sandbox");

let notifyOnExit = true;
// process.on("SIGINT", function () {
//   console.error("\n\nCaught interrupt signal");
//   process.exit();
// });

const runLoop = async (
  driver: WebDriver,
  runners: Partial<{
    [k in Platform]: {
      main: (c: Config, d: WebDriver) => Promise<Item[] | undefined>;
      pre?: (c: Config, d: WebDriver, configChanged?: boolean) => Promise<void>;
      perItem?: (c: Config, d: WebDriver, i: Item) => Promise<void>;
    };
  }>
) => {
  // TODO don't do all this crap
  const tmpDirExists = await fs.promises
    .access(tmpDir)
    .then(() => true)
    .catch(() => false);
  if (!tmpDirExists) {
    await fs.promises.mkdir(tmpDir);
  }
  const configExists = await fs.promises
    .access(`${tmpDir}/config.json`)
    .then(() => true)
    .catch(() => false);
  if (!configExists) {
    await fs.promises.writeFile(`${tmpDir}/config.json`, JSON.stringify({}));
  }

  const cachedConfig = await fs.promises.readFile(
    `${tmpDir}/config.json`,
    "utf-8"
  );
  let configChanged =
    JSON.stringify(JSON.parse(cachedConfig)?.search, null, 2) !==
    JSON.stringify(config.search, null, 2);

  if (configChanged) {
    log("Config change detected.");
    await fs.promises.writeFile(
      `${tmpDir}/config.json`,
      JSON.stringify(config, null, 2)
    );
  }
  for (const { pre } of Object.values(runners)) {
    await (pre?.(config, driver, configChanged) ?? Promise.resolve());
  }

  while (true) {
    try {
      for (const [platform, { main, perItem }] of Object.entries(runners)) {
        log(
          `\n=======================================================\n${platform}\n`
        );
        const items = await main(config, driver);
        verboseLog({ items });
        if (!items?.length) {
          log(`Somehow there are no items upon visiting ${platform}.`);
          continue;
        }
        await withUnseenItems(items, async (unseenItems) => {
          for (const item of unseenItems) {
            await perItem?.(config, driver, item);
          }
          await processItems(config, unseenItems).then((arr) =>
            notify(driver, arr)
          );
        });
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
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(ops)
    .build();

  driver.manage().setTimeouts({ implicit: 10000 });

  await startDiscordBot();

  // await loadCookies(driver);
  try {
    await runLoop(driver, {
      fb: {
        main: fbMain,
        perItem: fbPerItem,
      },
      kijiji: {
        main: kijijiMain,
        pre: kijijiPre,
        perItem: kijijiPerItem,
      },
    });
  } catch (e) {
    if (notifyOnExit) {
      discordLog("Crashed.");
      discordLog(e);
    }
  } finally {
    if (driver) {
      log("Closing the browser...");
      await driver.quit();
    }
  }
};

main();
