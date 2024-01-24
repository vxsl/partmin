import dotenv from "dotenv";
import { Builder, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { Config } from "types/config.js";
import _config from "../../config.json" assert { type: "json" };
import { kijijiMain, kijijiPre } from "./kijiji/index.js";
import { notify } from "./notify.js";
import { Item, processItems } from "./process.js";
import { errorLog, log, randomWait } from "./util/misc.js";
import { pushover } from "./util/pushover.js";

export const DEBUG = true; // TODO cli arg

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
  handler: (c: Config, d: WebDriver) => Promise<Item[] | undefined>,
  prepare?: (c: Config, d: WebDriver) => Promise<void>
) => {
  await (prepare?.(config, driver) ?? Promise.resolve());
  while (true) {
    try {
      const items = await handler(config, driver);
      if (items?.length) {
        const newItems = await processItems(config, items, { log: true });
        await notify(driver, newItems);
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

  driver.manage().setTimeouts({ implicit: 10000 });

  // // Close the WebDriver when the Node.js process exits
  // process.on("beforeExit", async () => {
  //   console.log("HIII");
  // });

  // await loadCookies(driver);
  try {
    // runLoop(driver, fbMain);
    await runLoop(driver, kijijiMain, kijijiPre);
  } catch (e) {
    if (notifyOnExit) {
      console.error(e);
      pushover({
        message: `⚠️ Something went wrong. You will no longer receive notifications.`,
      });
    }
  } finally {
    if (driver) {
      log("Closing the browser...");
      await driver.quit();
    }
  }
};

main();
