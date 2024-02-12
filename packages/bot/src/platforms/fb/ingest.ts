import { PetType } from "config.js";
import { startActivity } from "discord/presence.js";
import { discordSend } from "discord/util.js";
import { Listing, addBulletPoints, invalidateListing } from "listing.js";
import { fbListingXpath } from "platforms/fb/constants.js";
import fb from "platforms/fb/index.js";
import { By, WebDriver } from "selenium-webdriver";
import { PlatformKey } from "types/platform.js";
import { getConfig } from "util/config.js";
import {
  acresToSqft,
  findNestedJSONProperty,
  sqMetersToSqft,
} from "util/data.js";
import {
  Coordinates,
  Radius,
  decodeMapDevelopersURL,
  getGoogleMapsLink,
} from "util/geo.js";
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
      `Warning: Marketplace refused to load the following page correctly: <${url}>.\n\nTrying again later.`
    );
    this.name = "MarketplaceRadiusError";
  }
}

const fbGet = async (driver: WebDriver, url: string) => {
  await clearBrowsingData(driver);
  await driver.get(url);
};

export const perListing = async (driver: WebDriver, l: Listing) => {
  let url = getListingURL(l.id);
  debugLog(`visiting listing: ${url}`);

  await fbGet(driver, url);

  const info = await driver
    .findElements(
      By.xpath(`//script[contains(text(), "marketplace_product_details_page")]`)
    )
    .then((els) => els[0])
    .then((el) => el?.getAttribute("innerHTML"))
    .then(
      (html) =>
        findNestedJSONProperty(html ?? "", "marketplace_product_details_page")
          ?.target
    );

  if (!info) {
    discordSend(
      `Warning: couldn't retrieve info for the following Marketplace listing: ${url}.\nThe retrieval method may have changed.`,
      { bold: true }
    );
    // TODO do something else.

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
    const desc = info.redacted_description.text; // TODO is redacted_description always present? Maybe fall back to something else.
    if (desc) {
      l.details.longDescription = desc;
    }
  } catch (e) {
    log(e);
    // TODO
  }

  let unitIncludes, unitSubtitle;
  try {
    unitSubtitle = info.pdp_display_sections.find(
      (s: any) => s.section_type === "UNIT_SUBTITLE"
    );
  } catch {
    // TODO
  }
  try {
    unitIncludes = info.pdp_display_sections.find(
      (s: any) => s.section_type === "UNIT_INCLUDES"
    );
  } catch {
    // TODO
  }

  const config = await getConfig();

  try {
    const params = config.search.params;
    const unreliableParams = params.unreliableParams;

    try {
      if (
        unreliableParams?.requireOutdoorSpace &&
        !unitIncludes.pdp_fields.some((f: any) =>
          f.display_label.match(/balcony|terrace|deck|yard/i)
        )
      ) {
        invalidateListing(
          l,
          "unreliableParamsMismatch",
          "Doesn't explicitly offer outdoor space"
        );
      }
    } catch (e) {
      log(e);
      // TODO
    }

    try {
      if (
        unreliableParams?.requireParking &&
        !unitIncludes.pdp_fields.some((f: any) =>
          f.display_label.match(/parking|garage/i)
        )
      ) {
        invalidateListing(
          l,
          "unreliableParamsMismatch",
          "Doesn't explicitly offer parking"
        );
      }
    } catch (e) {
      log(e);
      // TODO
    }

    try {
      const userPets = Object.entries(params.pets ?? {})
        .filter(([, v]) => v)
        .map(([k]) => k as PetType);
      if (unreliableParams?.petsStrict && userPets.length) {
        const listingPets: string[] = unitIncludes.pdp_fields
          .filter((f: any) => f.display_label.match(/friendly/i))
          .map((f: any) =>
            f.display_label.match(/(.+) friendly/)?.[1]?.toLowerCase()
          )
          .filter(notUndefined);

        const implicityDisallowedPets = userPets.filter((p) =>
          p === "other" ? !!listingPets.length : !listingPets.includes(p)
        );

        if (implicityDisallowedPets.length) {
          invalidateListing(
            l,
            "unreliableParamsMismatch",
            `Doesn't explicitly allow pet types ${implicityDisallowedPets.join(
              ", "
            )}`
          );
        }
      }
    } catch (e) {
      log(e);
      // TODO
    }

    try {
      const areaStr = info.unit_area_info;
      if (areaStr && unreliableParams?.minAreaSqFt) {
        const _n: string | undefined = areaStr.match(/(\d+)/)?.[1];
        const n = _n === undefined ? undefined : parseInt(_n);
        const sqFt =
          n === undefined || isNaN(n)
            ? undefined
            : areaStr.match(/sq\.?\s?(ft|feet)/i)
            ? n
            : areaStr.includes("acres")
            ? acresToSqft(n)
            : sqMetersToSqft(n);
        if (sqFt) {
          if (sqFt < unreliableParams.minAreaSqFt) {
            invalidateListing(
              l,
              "unreliableParamsMismatch",
              `Area too small (${sqFt} sq ft less than specified value of ${unreliableParams?.minAreaSqFt})`
            );
          }
        }
      }
    } catch (e) {
      log(e);
      // TODO
    }
  } catch (e) {
    log(e);
    // TODO
  }

  try {
    const loc = info.home_address?.street;
    if (loc) {
      l.details.shortAddress = loc;
      const full =
        unitSubtitle?.pdp_fields.find((f: any) => f.icon_name === "pin")
          ?.display_label ?? "";
      l.computed = {
        ...(l.computed ?? {}),
        locationLinkText: loc,
        locationLinkURL: getGoogleMapsLink(
          full.length > loc.length ? full : loc
        ),
      };
    }
  } catch (e) {
    log(e);
    // TODO
  }

  try {
    const lat = info.location.latitude;
    const lon = info.location.longitude;
    l.details.coords = Coordinates.build(lat, lon);
  } catch (e) {
    log(e);
    // TODO
  }

  try {
    const imgs = info.listing_photos
      .map((p: any) => p?.image?.uri)
      .filter(notUndefined);
    if (imgs.length) {
      l.imgURLs = imgs;
    }
  } catch (e) {
    log(e);
    // TODO
  }

  try {
    const points: string[] = unitSubtitle?.pdp_fields
      .filter((f: any) => f.icon_name !== "pin")
      .map(({ display_label }: { display_label: string }) =>
        display_label.includes("Available ")
          ? display_label.match(/Available (.+)/)?.[0] ?? display_label
          : display_label.includes("Listed")
          ? undefined
          : display_label
      )
      .filter(notUndefined);
    addBulletPoints(l, points);
  } catch (e) {
    log(e);
    // TODO
  }
};

export const visitMarketplace = async (driver: WebDriver, radius: Radius) => {
  const config = await getConfig();
  const vals = {
    // location:
    latitude: radius.lat,
    longitude: radius.lon,
    radius:
      radius.diam +
      Math.random() * 0.00000001 +
      Math.random() * 0.0000001 +
      Math.random() * 0.000001 +
      Math.random() * 0.00001,

    // results configuration:
    sortBy: "creation_time_descend",
    exact: true,

    // search parameters:
    ...(config.search.params.exclude?.shared && {
      propertyType: ["house", "townhouse", "apartment-condo"].join(","),
    }),
    minPrice: config.search.params.price.min,
    maxPrice: config.search.params.price.max,
    minBedrooms: config.search.params.minBedrooms,
  };

  const city = config.search.location.city;
  let url = `https://facebook.com/marketplace/${city}/propertyrentals?`;
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

  await elementShouldExist("xpath", fbListingXpath, driver);

  // ensure facebook didn't ignore our requested radius:
  // TODO ensure lat and lon as well?
  const urlRadius = await driver
    .getCurrentUrl()
    .then((url) => url.match(/radius=([^&]+)/)?.[1])
    .then((r) => parseFloat(r ?? "0"));
  if (urlRadius === undefined) {
    throw new Error("Could not find radius in url");
  }
  const minRadius = radius.diam * 0.9;
  const maxRadius = radius.diam * 1.1;
  if (urlRadius < minRadius || urlRadius > maxRadius) {
    throw new MarketplaceRadiusError(url);
  }
};

export const getListings = async (driver: WebDriver): Promise<Listing[]> => {
  const config = await getConfig();

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
          ? parseInt(tokens[0].replace(",", ""))
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

        // sometimes facebook will show a private room for rent
        // even when the search parameters exclude "room only":
        ...(config.search.params.exclude?.shared &&
          ["Private room for rent", "Chambre privée à louer"].includes(
            title
          ) && {
            invalidDueTo: {
              paramsMismatch:
                "Room-only listing, configured to exclude shared units",
            },
          }),
      };

      await withElement(
        () => e.findElement(By.css("img")),
        (img) => img.getAttribute("src").then((src) => res.imgURLs.push(src))
      );

      return res;
    }
  ).then((arr) => arr.filter(notUndefined));
};

export const main = async (driver: WebDriver) => {
  const config = await getConfig();
  const listings: Listing[] = [];
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);
  let listingCount = 0;

  const activity = startActivity(fb.presenceActivities?.main, radii.length);

  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    if (!r) {
      continue; // I don't know why TypeScript doesn't know that r is not undefined here.
    }
    const rLabel = `radius ${i + 1}/${radii.length}`;
    log(
      `visiting fb marketplace [${rLabel}]: ${Radius.toString(r, {
        truncate: true,
      })}`
    );

    activity?.update(i);

    try {
      await tryNTimes(3, () => visitMarketplace(driver, r));
    } catch (e) {
      if (e instanceof MarketplaceRadiusError) {
        // TODO only send this error to the user if it persists over time
        discordSend(e.message, { italic: true });
        log(
          `Skipping ${rLabel} this time because Facebook refused to load the correct radius.`
        );
        continue;
      } else {
        throw e;
      }
    }

    debugLog("Parsing listings...");
    await withDOMChangesBlocked(driver, async () => {
      await getListings(driver).then((arr) => {
        verboseLog(
          `found the following listings in ${rLabel}: ${arr
            ?.map((l) => l.id)
            .join(", ")}`
        );
        listings.push(...arr);
      });
    });
    log(
      `found ${
        listings.length - listingCount
      } listings in ${rLabel} (${Radius.toString(r, { truncate: true })})`
    );
    listingCount = listings.length;
    if (i < radii.length - 1) {
      await randomWait({ short: true, suppressProgressLog: true });
    }
  }
  return listings;
};
