import dotenv from "dotenv";
import { Builder, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { fbMain } from "./fb/index.js";
import { notify } from "./notify.js";
import { processItems } from "./process.js";
import { log, randomWait } from "./util/misc.js";
import { pushover } from "./util/pushover.js";
import { loadCookies } from "./util/selenium.js";

const ops = new chrome.Options();
ops.addArguments("--headless");
ops.addArguments("--disable-gpu");
dotenv.config();

let notifyOnExit = true;
let sigintCount = 0;
process.on("SIGINT", function () {
  if (++sigintCount === 1) {
    log("Caught interrupt signal");
    notifyOnExit = false;
  }
});

const runLoop = async (
  driver: WebDriver,
  handler: Function,
  prepare?: (d: WebDriver) => Promise<void>
) => {
  await (prepare?.(driver) ?? Promise.resolve());
  while (true) {
    try {
      const items = await handler(driver);
      if (items?.length) {
        const newItems = await processItems(items, { log: true });
        await notify(newItems);
      } else {
        log("Somehow there are no items.");
      }
      await randomWait();
    } catch (err) {
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
    runLoop(driver, fbMain);
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
