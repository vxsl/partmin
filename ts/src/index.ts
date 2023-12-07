import dotenv from "dotenv";
import { Builder, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { Config } from "types/config.js";
import _config from "../../config.json";
import { kijijiMain } from "./kijiji/index.js";
import { notify } from "./notify.js";
import { Item, processItems } from "./process.js";
import { errorLog, log, randomWait } from "./util/misc.js";
import { pushover } from "./util/pushover.js";
import { loadCookies } from "./util/selenium.js";

const config = _config as Config; // TODO don't naively assert here

const headless = false;

const ops = new chrome.Options();
if (headless) {
  ops.addArguments("--headless");
  ops.addArguments("--disable-gpu");
}

let notifyOnExit = true;
process.on("SIGINT", function () {
  console.error("\n\nCaught interrupt signal");
  process.exit();
});

const runLoop = async (
  driver: WebDriver,
  handler: (c: Config, d: WebDriver) => Promise<Item[] | undefined>,
  prepare?: (c: Config, d: WebDriver) => Promise<void>
) => {
  await (prepare?.(config, driver) ?? Promise.resolve());
  while (true) {
    try {
      const items = await handler(config, driver);
      if (items?.length) {
        const newItems = await processItems(config, items, { log: true });
        await notify(newItems);
      } else {
        log("Somehow there are no items.");
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

  await loadCookies(driver);
  try {
    // runLoop(driver, fbMain);
    runLoop(driver, kijijiMain);
  } catch (e) {
    if (notifyOnExit) {
      console.error(e);
      pushover({
        message: `⚠️ Something went wrong. You will no longer receive notifications.`,
      });
    }
  }
};

main();
