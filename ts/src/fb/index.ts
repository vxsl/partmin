import { WebDriver } from "selenium-webdriver";
import {
  clearSingleLineLog,
  log,
  singleLineLog,
  waitSeconds,
} from "../util/misc.js";
import { isOnHomepage, login } from "./util/index.js";
import {
  newItemNotify,
  processItems,
  scrapeItems,
  visitFacebook,
  visitMarketplace,
} from "./util/marketplace.js";

import {
  elementShouldExist,
  loadCookies,
  saveCookies,
} from "../util/selenium.js";

const runFacebookLoop = async (driver: WebDriver) => {
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
      break;
    }
  }
};

export default runFacebookLoop;
