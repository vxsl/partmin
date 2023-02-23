import dotenv from "dotenv";
import { fbMain, fbPre } from "./fb/index.js";
import { Builder, WebDriver } from "selenium-webdriver";
import { pushover } from "./util/pushover.js";
import { loadCookies } from "./util/selenium.js";
import { processItems } from "./process.js";
import { log, randomWait } from "./util/misc.js";
import { notify } from "./notify.js";

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
  const driver = await new Builder().forBrowser("chrome").build();
  await loadCookies(driver);
  try {
    runLoop(driver, fbMain, fbPre);
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
