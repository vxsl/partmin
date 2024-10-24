import { startActivity } from "discord/presence.js";
import { discordSend } from "discord/util.js";
import { Listing, invalidateListing } from "listing.js";
import { fbListingXpath } from "platforms/fb/constants.js";
import fb from "platforms/fb/index.js";
import { fbClick, fbType, isOnHomepage } from "platforms/fb/util.js";
import { By, IWebDriverCookie, WebDriver } from "selenium-webdriver";
import { getUserConfig } from "util/config.js";
import { Circle, Coordinates, decodeMapDevelopersURL } from "util/geo.js";
import { findNestedJSONProperty } from "util/json.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { notUndefined, randomWait, tryNTimes } from "util/misc.js";
import {
  clearBrowsingData,
  elementShouldExist,
  withDOMChangesBlocked,
  withElement,
  withElementsByXpath,
} from "util/selenium.js";

const platform: PlatformKey = "fb";

const getListingURL = (id: string) => `https://fb.com/marketplace/item/${id}`;
class MarketplaceRadiusError extends Error {
  constructor(url: string) {
    super(
      `Warning: Marketplace refused to load the following page correctly: <${url}>.\nTrying again later.`
    );
    this.name = "MarketplaceRadiusError";
  }
}

let cachedCookies: IWebDriverCookie[] | undefined = undefined;
let cachedLocalStorage: Storage | undefined = undefined;
let cachedSessionStorage: Storage | undefined = undefined;

const fbGet = async (
  driver: WebDriver,
  url: string,
  options?: {
    incognito?: boolean;
  }
) => {
  if (!options?.incognito) {
    return await driver.get(url);
  }
  cachedCookies = await driver.manage().getCookies();
  cachedLocalStorage = await driver.executeScript("return window.localStorage");
  cachedSessionStorage = await driver.executeScript(
    "return window.sessionStorage"
  );
  await clearBrowsingData(driver);

  await driver.get(url);

  await clearBrowsingData(driver);
  if (cachedCookies) {
    for (const cookie of cachedCookies) {
      await driver.manage().addCookie(cookie);
    }
  }
  if (cachedLocalStorage) {
    await driver.executeScript(
      `Object.entries(${JSON.stringify(
        cachedLocalStorage
      )}).forEach(([k, v]) => localStorage.setItem(k, v));`
    );
  }
  if (cachedSessionStorage) {
    await driver.executeScript(
      `Object.entries(${JSON.stringify(
        cachedSessionStorage
      )}).forEach(([k, v]) => sessionStorage.setItem(k, v));`
    );
  }
};

// const fb

export const perListing = async (driver: WebDriver, l: Listing) => {
  let url = getListingURL(l.id);
  debugLog(`visiting listing: ${url}`);

  let infos: any[] = [];

  await tryNTimes(3, async () => {
    await fbGet(driver, url, { incognito: true });

    infos = await driver
      .findElements(
        By.xpath(
          `//script[contains(text(), "marketplace_product_details_page")]`
        )
      )
      .then((els) =>
        Promise.all(
          els
            .map((e) =>
              e
                .getAttribute("innerHTML")
                .then(
                  (html) =>
                    findNestedJSONProperty(
                      html ?? "",
                      "marketplace_product_details_page"
                    )?.target
                )
            )
            .filter(notUndefined)
        )
      );

    if (!infos?.length) {
      throw new Error("Couldn't find marketplace_product_details_page");
    }
    // console.log(`I have ${infos.length} infos`);
    // console.log(JSON.stringify(infos, null, 2));

    const getPart = (fn: (i: any) => any) => {
      for (const info of infos) {
        try {
          const part = fn(info);
          if (part !== undefined) {
            return part;
          }
        } catch (e) {}
      }
      throw new Error(`Couldn't find property: ${fn.toString()}`);
    };

    if (!infos.length) {
      discordSend(
        `Warning: couldn't retrieve info for the following Marketplace listing: ${url}.\nThe retrieval method may have changed.`,
        { bold: true }
      );
      // TODO try something else.

      // // if there's a <span> with text "See more", click it:
      // await driver
      //   .findElements(By.xpath(`//span[(text()="See more")]`))
      //   .then(async (els) => {
      //     if (els.length) {
      //       await click(els[0]);
      //     }
      //   });
      return;
    }

    try {
      const timestamp = getPart((i) => i.creation_time);
      if (timestamp === undefined) {
        throw new Error("Couldn't find creation_time");
      }
      l.details.date = timestamp;
      const date = new Date(timestamp * 1000);
      debugLog(`This listing was created at ${date}`);
      if (Date.now() - date.getTime() > 3600000) {
        invalidateListing(l, "stale", "Listing is older than an hour");
      }
    } catch (e) {
      log(e);
      invalidateListing(l, "stale", "Couldn't find creation_time");
      // TODO
    }

    try {
      const desc = getPart((i) => i.redacted_description.text); // TODO is redacted_description always present? Maybe fall back to something else.
      if (desc) {
        l.details.longDescription = desc;
      }
    } catch (e) {
      log(e);
      // TODO
    }

    // const config = await getUserConfig();

    try {
      const lat = getPart((i) => i.location.latitude);
      const lon = getPart((i) => i.location.longitude);
      l.details.coords = Coordinates.build(lat, lon);
    } catch (e) {
      log(e);
      // TODO
    }

    try {
      const imgs = getPart((i) => i.listing_photos)
        .map((p: any) => p?.image?.uri)
        .filter(notUndefined);
      if (imgs.length) {
        l.imgURLs = imgs;
      }
    } catch (e) {
      log(e);
      // TODO
    }
  });
};

export const visitMarketplace = async (driver: WebDriver, radius: Circle) => {
  const config = await getUserConfig();
  const vals = {
    // location:
    latitude: radius.lat,
    longitude: radius.lon,
    radius:
      radius.radius +
      Math.random() * 0.00000001 +
      Math.random() * 0.0000001 +
      Math.random() * 0.000001 +
      Math.random() * 0.00001,

    // results configuration:
    // sortBy: "creation_time_descend",
    exact: true,

    // // search parameters:
    // ...(config.search.params.exclude?.shared && {
    //   propertyType: ["house", "townhouse", "apartment-condo"].join(","),
    // }),
    // ...(config.search.params.price.min && { minPrice: config.search.params.price.min}),
    // maxPrice: config.search.params.price.max,
    // minBedrooms: config.search.params.minBedrooms,
  };

  const city = config.search.location.city;
  let url = `https://facebook.com/marketplace?`;
  for (const [k, v] of Object.entries(vals)) {
    if (v !== undefined && v !== null) {
      url += `${k}=${v}&`;
    }
  }
  debugLog(`url: ${url}`);

  await fbGet(driver, url);

  await driver.wait(async () => {
    const state = (await driver.executeScript(
      "return document.readyState"
    )) as string;
    return state === "complete";
  });

  return url;
};

export const visitFacebook = async (driver: WebDriver) => {
  await driver.get("https://facebook.com");
};

export const login = async (driver: WebDriver) => {
  const USER = process.env.FB_USER;
  const PASS = process.env.FB_PASS;
  if (!USER || !PASS) throw new Error("Missing FB_USER or FB_PASS env var");

  await fbType(driver, driver.findElement(By.name("email")), USER);
  await fbType(driver, driver.findElement(By.name("pass")), PASS);
  await fbClick(driver, driver.findElement(By.name("login")));
  await elementShouldExist("css", '[aria-label="Search Facebook"]', driver);
};

export const getListings = async (driver: WebDriver): Promise<Listing[]> => {
  const config = await getUserConfig();

  verboseLog("Waiting for search page to be ready");
  await elementShouldExist("css", '[aria-label="Search Marketplace"]', driver);
  verboseLog("Search page ready");

  return await withElementsByXpath(
    driver,
    fbListingXpath,
    async (e): Promise<Listing | undefined> => {
      const href = await e.getAttribute("href");
      const id = href.match(/\d+/)?.[0];

      if (!id) {
        log(`Unable to parse listing ID from ${href}`);
        return undefined;
      }

      const SEP = " - ";
      const text = await e
        .getText()
        .then((t) =>
          t.replace("\n", SEP).replace(/^C\$+/, "").replace("\n", SEP)
        );
      const tokens = text.split(SEP);
      const price =
        tokens[0] !== undefined
          ? tokens[0].includes("FREE")
            ? 0
            : parseInt(tokens[0].replace(/^[^\d]*|[\$,]/g, ""))
          : undefined;
      const title = tokens.slice(1, tokens.length - 1).join(SEP);

      const res: Listing = {
        platform,
        id,
        details: {
          title,
          price,
        },
        url: getListingURL(id),
        imgURLs: [],
        videoURLs: [],

        // // sometimes facebook will show a private room for rent
        // // even when the search parameters exclude "room only":
        // ...(config.search.params.exclude?.shared &&
        //   ["Private room for rent", "Chambre privée à louer"].includes(
        //     title
        //   ) && {
        //     invalidDueTo: {
        //       paramsMismatch:
        //         "Room-only listing, configured to exclude shared units",
        //     },
        //   }),
      };

      await withElement(
        () => e.findElement(By.css("img")),
        (img) => img.getAttribute("src").then((src) => res.imgURLs.push(src))
      );

      return res;
    },
    {
      limit: 5,
    }
  ).then((arr) => arr.filter(notUndefined));
};

export const init = async (driver: WebDriver) => {
  await visitFacebook(driver);
  if ((await isOnHomepage(driver)) === false) {
    await login(driver);
  }
};

export const main = async (driver: WebDriver) => {
  const config = await getUserConfig();
  const listings: Listing[] = [];
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);
  let listingCount = 0;

  const activity = startActivity(fb.presenceActivities?.main, radii.length);

  const failedRadiiIndices: number[] = [];

  for (let secondAttempt = 0; secondAttempt < 2; secondAttempt++) {
    const arr = secondAttempt ? failedRadiiIndices.map((i) => radii[i]) : radii;
    for (let i = 0; i < arr.length; i++) {
      const _i = secondAttempt ? failedRadiiIndices[i] ?? i : i;
      const r = arr[i];
      if (!r) {
        continue; // I don't know why TypeScript doesn't know that r is not undefined here.
      }
      const rLabel = `radius ${_i + 1}/${radii.length}`;
      log(
        `visiting fb marketplace [${rLabel}${
          secondAttempt ? " (once more since it failed last time)" : ""
        }]: ${Circle.toString(r, {
          truncate: true,
        })}`
      );

      activity?.update(i);

      try {
        await tryNTimes(3, async () => {
          const url = await visitMarketplace(driver, r);

          await withDOMChangesBlocked(driver, async () => {
            await elementShouldExist("xpath", fbListingXpath, driver);

            verboseLog(
              "Ensuring facebook didn't override the specified radius..."
            );
            await driver
              .findElement(By.xpath(`//span[contains(., 'Within')]`))
              .then((el) => el.getText())
              .then((text) => text.match(/(\d+\.?\d*)\s?(kilomet|km)/)?.[1])
              .then((_r) => {
                if (_r === undefined) {
                  throw new Error("Could not validate radius in page");
                }
                const actualRadius = parseFloat(_r);
                const minAcceptable = r.radius * 0.9;
                const maxAcceptable = r.radius * 1.1;
                if (
                  actualRadius < minAcceptable ||
                  actualRadius > maxAcceptable
                ) {
                  log(
                    `Facebook loaded results for ${actualRadius} km radius instead of ${r.radius} km radius.`
                  );
                  throw new MarketplaceRadiusError(url);
                } else {
                  log(
                    `Facebook successfully loaded results for ${actualRadius} km radius.`
                  );
                }
              });

            debugLog("Parsing listings...");
            await getListings(driver).then((arr) => {
              verboseLog(
                `found the following listings in ${rLabel}: ${arr
                  ?.map((l) => l.id)
                  .join(", ")}`
              );
              listings.push(...arr);
            });
          });
        });
        log(
          `found ${
            listings.length - listingCount
          } listings in ${rLabel} (${Circle.toString(r, { truncate: true })})`
        );
        listingCount = listings.length;
        if (i < arr.length - 1) {
          await randomWait({ short: true, suppressProgressLog: true });
        }
      } catch (e) {
        if (e instanceof MarketplaceRadiusError) {
          if (secondAttempt) {
            discordSend(e.message, { italic: true });
            log(
              `Skipping ${rLabel} this time because Facebook refused to load the correct radius.`
            );
          } else {
            failedRadiiIndices.push(i);
          }
          continue;
        } else {
          throw e;
        }
      }
    }
  }
  return listings;
};
