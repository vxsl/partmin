// const chromedriver = require("chromedriver");
import dotenv from "dotenv";
import { Builder, By, until } from "selenium-webdriver";
import {
  newItemNotify,
  processItems,
  scrapeItems,
} from "./util/fb-marketplace.js";
import {
  fbClick,
  fbType,
  isOnHomepage,
  marketplaceReady,
  setMarketplaceLocation,
} from "./util/fb.js";
import { getConfigValue } from "./util/io.js";
import { log, waitSeconds } from "./util/misc.js";
import { pushover } from "./util/pushover.js";
import { loadCookies, saveCookies } from "./util/selenium.js";

dotenv.config();
const USER = process.env.FB_USER;
const PASS = process.env.FB_PASS;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

const MIN_PRICE: number = await getConfigValue((c) => c.search.price.min);
const MAX_PRICE: number = await getConfigValue((c) => c.search.price.max);
const MIN_AREA: number = await getConfigValue(
  (c) => c.search.minArea * 0.09290304
);

const PATH = `\
/marketplace/category/propertyrentals?\
minPrice=${MIN_PRICE}&\
maxPrice=${MAX_PRICE}&\
minAreaSize=${MIN_AREA}&\
exact=false&\
propertyType=apartment-condo,house,townhouse&\
minBedrooms=2&\
sortBy=creation_time_descend
`;
// radius=${10}&\
// latitude=${LAT}&\
// longitude=${LONG}&\

// =======================================================================================

async function run() {
  if (!USER || !PASS || !PUSHOVER_TOKEN || !PUSHOVER_USER) {
    throw new Error("Missing env vars");
  }

  const driver = await new Builder().forBrowser("chrome").build();

  await loadCookies(driver);
  await driver.get(`https://www.facebook.com`);

  if ((await isOnHomepage(driver)) === false) {
    await fbType(driver, driver.findElement(By.name("email")), USER);
    await fbType(driver, driver.findElement(By.name("pass")), PASS);
    await fbClick(driver, driver.findElement(By.name("login")));
    await driver.wait(
      until.elementLocated(By.css('[aria-label="Search Facebook"]')),
      10 * 1000
    );
  }

  const basic = `https://www.facebook.com${PATH}`;

  while (true) {
    try {
      await driver.get(basic);
      saveCookies(driver);
      await driver.wait(
        until.elementLocated(By.css('[aria-label="Search Marketplace"]')),
        10 * 1000
      );

      waitSeconds(Math.random() * 1 + 1);

      await setMarketplaceLocation(driver, "H2V", 13);
      await marketplaceReady(driver);

      const items = await scrapeItems(driver);
      if (!items?.length) {
        log("Somehow there are no items. Trying again.");
        continue;
      }

      const newItems = await processItems(items, { log: true });

      // send a notification for each new item:
      for (const item of newItems) {
        await newItemNotify(item);
        await waitSeconds(1);
      }

      // wait for a random interval between 1 and 2 minutes:
      await waitSeconds(Math.random() * 60 + 60);
    } catch (err) {
      pushover({
        message: `⚠️ Something went wrong. You will no longer receive notifications.`,
      });
      console.error(err);
      break;
    }
  }
  driver.close();
}

run();
