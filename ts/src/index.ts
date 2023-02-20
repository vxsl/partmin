// const chromedriver = require("chromedriver");
import dotenv from "dotenv";
import { Builder, By, until } from "selenium-webdriver";
import {
  fbClick,
  fbType,
  isOnHomepage,
  marketplaceReady,
  MP_ITEM_XPATH,
  setMarketplaceLocation,
} from "./util/fb.js";
import {
  downloadImage,
  getConfigValue,
  readJSON,
  writeJSON,
} from "./util/io.js";
import { waitSeconds } from "./util/misc.js";
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

const BLACKLIST: string[] = await getConfigValue((c) =>
  c.search.blacklist.map((b: string) => b.toLowerCase())
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
  // await driver.navigate().refresh();

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

      // scrape the items from the results page:
      const els = await Promise.all(
        (
          await driver.findElements(By.xpath(MP_ITEM_XPATH))
        ).map((e) =>
          e.getAttribute("href").then(async (href) => {
            const id = href.match(/\d+/)?.[0];
            if (!id) pushover({ title: "ERROR", message: href, url: href });

            const imgSrc = await e
              .findElement(By.css("img"))
              .then((img) => img.getAttribute("src"));
            await downloadImage(imgSrc, "tmp/images/" + id + ".jpg");

            const SEP = " - ";
            const text = await e
              .getText()
              .then((t) =>
                t.replace("\n", SEP).replace(/^C+/, "").replace("\n", SEP)
              );
            const tokens = text.split(SEP);
            const price = tokens[0] ?? "ERROR_PRICE";
            const loc = tokens[tokens.length - 1] ?? "ERROR_LOC";
            const name =
              tokens.slice(1, tokens.length - 1).join(SEP) ?? "ERROR_NAME";

            return { id, title: `${price} - ${loc}`, message: name };
          })
        )
      );

      // determine which items are new:
      const seenItems = await readJSON("tmp/seen.json");
      const newItems = els.filter(({ id }) => !seenItems.includes(id));
      writeJSON("tmp/seen.json", [
        ...newItems.map(({ id }) => id),
        ...seenItems,
      ]);

      if (newItems?.length) {
        console.log(
          `checked ${els.length} items, found ${newItems.length} new:, `,
          newItems
        );
      } else {
        console.log(`checked ${els.length} items, found 0 new.`);
      }
      // send a notification for each new item:
      for (const item of newItems) {
        const { id, title, message } = item;
        if (
          !BLACKLIST.some((b) => JSON.stringify(item).toLowerCase().includes(b))
        ) {
          // if (JSON.stringify(item).contain)
          await pushover(
            {
              id,
              title: `🏘️ ${title} `,
              message,
              url: `fb://marketplace_product_details?id=${id}`,
            },
            `${id}.jpg`
          );
          await waitSeconds(1);
        }
      }

      // wait for a random interval between 1 and 2 minutes:
      await waitSeconds(Math.random() * 60 + 60);
    } catch (err) {
      console.error(err);
      break;
    }
  }
  driver.close();
}

run();
