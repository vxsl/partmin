import dotenv from "dotenv";
import { Builder } from "selenium-webdriver";
import {
  newItemNotify,
  processItems,
  scrapeItems,
  visitFacebook,
  visitMarketplace,
} from "./util/fb-marketplace.js";
import { isOnHomepage, login } from "./util/fb.js";
import {
  clearSingleLineLog,
  log,
  singleLineLog,
  waitSeconds,
} from "./util/misc.js";

import { pushover } from "./util/pushover.js";
import {
  elementShouldExist,
  loadCookies,
  saveCookies,
} from "./util/selenium.js";

dotenv.config();

let notifyOnExit = true;
let sigintCount = 0;
process.on("SIGINT", function () {
  if (++sigintCount === 1) {
    console.log("Caught interrupt signal");
    notifyOnExit = false;
  }
});

async function run() {
  const driver = await new Builder().forBrowser("chrome").build();

  await loadCookies(driver);
  await visitFacebook(driver);

  if ((await isOnHomepage(driver)) === false) {
    await login(driver);
  }

  while (true) {
    try {
      const url = await visitMarketplace(driver);
      log(url);
      saveCookies(driver, ["c_user", "xs"]);
      await elementShouldExist(
        "css",
        '[aria-label="Search Marketplace"]',
        driver
      );

      await waitSeconds(Math.random() * 1 + 1);

      const items = await scrapeItems(driver);
      if (!items?.length) {
        log("Somehow there are no items. Trying again.");
        continue;
      }

      const newItems = await processItems(items, { log: true });

      for (const item of newItems) {
        await newItemNotify(item);
        await waitSeconds(1);
      }

      const toWait = Math.round(Math.random() * 60 + 60);

      // for toWait seconds, log the number of seconds left, but replace the last line instead of adding a new line:

      var skip = false;

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", () => {
        skip = true;
        process.stdin.pause();
        process.stdin.setRawMode(false);
      });
      singleLineLog("\n");
      for (let i = 0; i < toWait; i++) {
        if (skip) break;
        singleLineLog(
          toWait - i === 1
            ? ""
            : `Waiting ${toWait - i} seconds. Press any key to skip wait.`
        );
        await waitSeconds(1);
      }
      process.stdin.setRawMode(false);
      clearSingleLineLog();
      clearSingleLineLog();
      console.log("\n");
    } catch (err) {
      await driver.close();
      // process.stdin.setRawMode(false);
      if (notifyOnExit) {
        pushover({
          message: `⚠️ Something went wrong. You will no longer receive notifications.`,
        });
        console.error(err);
      }
      break;
    }
  }
}

run();
