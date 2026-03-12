import { startActivity } from "discord/presence.js";
import { discordSend } from "discord/util.js";
import { requirePage } from "index.js";
import { addBulletPoints, invalidateListing, Listing } from "listing.js";
import { fbListingXpath } from "platforms/fb/constants.js";
import fb from "platforms/fb/index.js";
import {
  fbClick,
  fbType,
  getCurrentRadius,
  isOnHomepage,
  setMarketplaceLocation,
} from "platforms/fb/util.js";
import type { Cookie } from "playwright";
import { PlatformKey } from "types/platform.js";
import { PetType } from "user-config.js";
import { getUserConfig } from "util/config.js";
import {
  acresToSqft,
  approxFSA,
  Circle,
  Coordinates,
  decodeMapDevelopersURL,
  getGoogleMapsLink,
  sqMetersToSqft,
} from "util/geo.js";
import { findNestedJSONProperty } from "util/json.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { isNight, notUndefined, randomWait, tryNTimes } from "util/misc.js";
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

let cachedCookies: Cookie[] | undefined = undefined;
let cachedLocalStorage: Record<string, string> | undefined = undefined;
let cachedSessionStorage: Record<string, string> | undefined = undefined;

const fbGet = async (
  url: string,
  options?: {
    incognito?: boolean;
  }
) => {
  const page = requirePage();
  if (!options?.incognito) {
    return await page.goto(url);
  }
  cachedCookies = await page.context().cookies();
  cachedLocalStorage = await page.evaluate(() => ({ ...window.localStorage }));
  cachedSessionStorage = await page.evaluate(() => ({
    ...window.sessionStorage,
  }));
  await clearBrowsingData();

  await page.goto(url);

  await clearBrowsingData();
  if (cachedCookies) {
    await page.context().addCookies(cachedCookies);
  }
  if (cachedLocalStorage) {
    await page.evaluate(
      (ls: Record<string, string>) => Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v)),
      cachedLocalStorage
    );
  }
  if (cachedSessionStorage) {
    await page.evaluate(
      (ss: Record<string, string>) =>
        Object.entries(ss).forEach(([k, v]) => sessionStorage.setItem(k, v)),
      cachedSessionStorage
    );
  }
};

export const perListing = async (l: Listing) => {
  const page = requirePage();
  let url = getListingURL(l.id);
  debugLog(`visiting listing: ${url}`);

  let infos: any[] = [];

  const config = await getUserConfig();
  const isAptSearch = config.search.category === "propertyrentals";

  await tryNTimes(3, async () => {
    await fbGet(url, { incognito: true });

    const els = await page
      .locator(
        `xpath=//script[contains(text(), "marketplace_product_details_page")]`
      )
      .all();
    infos = (
      await Promise.all(
        els
          .map((e) =>
            e
              .innerHTML()
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
    ).filter(notUndefined);

    if (!infos?.length) {
      throw new Error("Couldn't find marketplace_product_details_page");
    }

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

    const maxMin = isNight() ? 60 : 30;

    try {
      const timestamp = getPart((i) => i.creation_time);
      if (timestamp === undefined) {
        throw new Error("creation_time is undefined");
      }
      l.details.date = timestamp;
      const date = new Date(timestamp * 1000);
      debugLog(`This listing was created at ${date}`);

      if (Date.now() - date.getTime() > maxMin * 60 * 1000) {
        invalidateListing(
          l,
          "stale",
          `Listing is older than ${maxMin} minutes`
        );
      }
    } catch (e) {
      debugLog(`Couldn't find creation_time for listing ${l.id}: ${e}`);
      // TODO make this less silly... I'm tired atm:
      try {
        l.details.dateFallbackStr = getPart((i) =>
          i.pdp_display_sections.find((s: any) =>
            s.pdp_fields.find((f: any) => f.display_label.includes("Listed"))
          )
        )?.pdp_fields.find((f: any) =>
          f.display_label.includes("Listed")
        )?.display_label;

        if (
          (maxMin <= 60 &&
            l.details.dateFallbackStr?.toLowerCase().includes("hours")) ||
          l.details.dateFallbackStr?.toLowerCase().includes("day") ||
          l.details.dateFallbackStr?.toLowerCase().includes("week") ||
          l.details.dateFallbackStr?.toLowerCase().includes("month") ||
          l.details.dateFallbackStr?.toLowerCase().includes("year")
        ) {
          invalidateListing(
            l,
            "stale",
            `Stale threshold is ${maxMin} minutes and found text "${l.details.dateFallbackStr}"`
          );
        }
      } catch (e) {
        log(e);
        throw new Error(`Couldn't determine listing age for ${l.id}: ${e}`);
      }
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

    if (!isAptSearch) {
      return;
    }

    let unitIncludes, unitSubtitle;
    try {
      unitSubtitle = getPart((i) =>
        i.pdp_display_sections.find(
          (s: any) => s.section_type === "UNIT_SUBTITLE"
        )
      );
    } catch {
      // TODO
    }
    try {
      unitIncludes = getPart((i) =>
        i.pdp_display_sections.find(
          (s: any) => s.section_type === "UNIT_INCLUDES"
        )
      );
    } catch {
      // TODO
    }

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
        const areaStr = getPart((i) => i.unit_area_info);
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
      const loc = getPart((i) => i.home_address.street);
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
  });
};

export const visitMarketplace = async (radius: Circle) => {
  const page = requirePage();
  const config = await getUserConfig();

  const city = config.search.location.city;
  const category = config.search.category ?? "propertyrentals";
  const isAptSearch = category === "propertyrentals";

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
    sortBy: "creation_time_descend",
    exact: true,

    // search parameters:
    ...(isAptSearch &&
      config.search.params.exclude?.shared && {
        propertyType: ["house", "townhouse", "apartment-condo"].join(","),
      }),
    ...(config.search.params.price.min !== undefined && {
      minPrice: config.search.params.price.min,
    }),
    ...(config.search.params.price.max !== undefined && {
      maxPrice: config.search.params.price.max,
    }),
    ...(isAptSearch &&
      config.search.params.minBedrooms !== undefined && {
        minBedrooms: config.search.params.minBedrooms,
      }),
  };

  let url = `https://facebook.com/marketplace/${city}/${category}?`;
  for (const [k, v] of Object.entries(vals)) {
    if (v !== undefined && v !== null) {
      url += `${k}=${v}&`;
    }
  }
  debugLog(`url: ${url}`);

  await fbGet(url);

  await page.waitForLoadState("load");

  return url;
};

export const visitFacebook = async () => {
  await requirePage().goto("https://facebook.com");
};

export const login = async () => {
  const page = requirePage();
  const USER = process.env.FB_USER;
  const PASS = process.env.FB_PASS;
  if (!USER || !PASS) throw new Error("Missing FB_USER or FB_PASS env var");

  await fbType(page.locator('[name="email"]'), USER);
  await fbType(page.locator('[name="pass"]'), PASS);
  await fbClick(page.locator('[aria-label="Log In"]'));
  await elementShouldExist("css", '[aria-label="Search Facebook"]');
};

export const getListings = async (): Promise<Listing[]> => {
  verboseLog("Waiting for search page to be ready");
  await elementShouldExist("css", '[aria-label="Search Marketplace"]');
  verboseLog("Search page ready");
  const config = await getUserConfig();

  return await withElementsByXpath(
    fbListingXpath,
    async (e): Promise<Listing | undefined> => {
      const href = await e.getAttribute("href");
      const id = href?.match(/\d+/)?.[0];

      if (!id) {
        log(`Unable to parse listing ID from ${href}`);
        return undefined;
      }

      const SEP = " - ";
      const text = await e
        .innerText()
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
        () => e.locator("img"),
        (img) => img.getAttribute("src").then((src) => src && res.imgURLs.push(src))
      );

      return res;
    }
  ).then((arr) => arr.filter(notUndefined));
};

export const init = async () => {
  await visitFacebook();
  if ((await isOnHomepage()) === false) {
    await login();
  }
};

export const main = async (
  processListings: (listings: Listing[]) => Promise<void>
) => {
  const config = await getUserConfig();
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);

  const activity = startActivity(fb.presenceActivities?.main, radii.length);

  const failedRadiiIndices: number[] = [];

  for (let secondAttempt = 0; secondAttempt < 2; secondAttempt++) {
    const arr = secondAttempt ? failedRadiiIndices.map((i) => radii[i]) : radii;
    for (let i = 0; i < arr.length; i++) {
      const _i = secondAttempt ? failedRadiiIndices[i] ?? i : i;
      const r = arr[i];
      if (!r) {
        continue;
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
        await tryNTimes(3, async (i) => {
          const url = await visitMarketplace(r);
          let closestRadius = undefined;
          if (i > 0) {
            log("Trying to set the correct radius manually...");
            const fsa = await approxFSA(r);
            closestRadius = await setMarketplaceLocation(fsa, r.radius).catch(
              async (e) => {
                log(e);
                const actualRadius = await getCurrentRadius();
                if (Math.abs(actualRadius - r.radius) < 0.1) {
                  log(
                    `Happily, Facebook ended up loaded results for ${actualRadius} km after all.`
                  );
                  return actualRadius;
                }
                throw e;
              }
            );
          }
          let radius = closestRadius ?? r.radius;

          await withDOMChangesBlocked(async () => {
            await elementShouldExist("xpath", fbListingXpath);

            verboseLog(
              "Ensuring facebook didn't override the specified radius..."
            );
            await getCurrentRadius().then((actualRadius) => {
              const minAcceptable = radius * 0.9;
              const maxAcceptable = radius * 1.1;

              if (i > 0 && Math.abs(actualRadius - r.radius) < 0.1) {
                log(
                  `Happily, Facebook ended up loaded results for ${actualRadius} km after all.`
                );
              } else if (
                actualRadius < minAcceptable ||
                actualRadius > maxAcceptable
              ) {
                log(
                  `Facebook loaded results for ${actualRadius} km radius instead of ${radius} km radius.`
                );

                throw new MarketplaceRadiusError(url);
              } else {
                log(
                  `Facebook successfully loaded results for ${actualRadius} km radius.`
                );
              }
            });

            debugLog("Parsing listings...");
            const listings = await getListings();
            verboseLog(
              `found ${listings.length} listings in ${rLabel}: ${listings
                ?.map((l) => l.id)
                .join(", ")}`
            );
            await processListings(listings);
          });
        });
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
};
