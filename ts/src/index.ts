import dotenv from "dotenv";
import { Builder, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { Config } from "types/config.js";
import _config from "../../config.json" assert { type: "json" };
import { kijijiMain, kijijiPre } from "./kijiji/index.js";
import { notify } from "./notify.js";
import { Item, Platform, processItems, withUnseenItems } from "./process.js";
import { discordLog, errorLog, log, randomWait } from "./util/misc.js";
import { pushover } from "./util/pushover.js";
import { fbMain, fbPerItem } from "./fb/index.js";

export const DEBUG = true; // TODO cli arg
export const VERBOSE = false; // TODO cli arg

process.title = "partmin";

dotenv.config();

const config = _config as Config; // TODO don't naively assert here

const headless = false;

const ops = new chrome.Options();
if (headless) {
  ops.addArguments("--headless");
  ops.addArguments("--disable-gpu");
}

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
      pre?: (c: Config, d: WebDriver) => Promise<void>;
      perItem?: (c: Config, d: WebDriver, i: Item) => Promise<void>;
    };
  }>
) => {
  for (const { pre } of Object.values(runners)) {
    await (pre?.(config, driver) ?? Promise.resolve());
  }

  while (true) {
    try {
      const newItems: Item[] = [];
      for (const [platform, { main, perItem }] of Object.entries(runners)) {
        const items = await main(config, driver);

        if (items?.length) {
          if (perItem) {
            await withUnseenItems(
              items,
              { markAsSeen: false },
              async (unseenItems) => {
                for (const item of unseenItems) {
                  await perItem(config, driver, item);
                }
              }
            );
          }
          await processItems(config, items).then((arr) =>
            newItems.push(...arr)
          );
        } else {
          log(`Somehow there are no items upon visiting ${platform}.`);
        }
      }
      // TODO sort based on time
      await notify(driver, newItems);
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

  // await loadCookies(driver);
  try {
    await runLoop(driver, {
      fb: {
        main: fbMain,
        perItem: fbPerItem,
      },
      // kijiji: {
      //   main: kijijiMain,
      //   pre: kijijiPre,
      // },
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
