import { AttachmentBuilder } from "discord.js";
import { startActivity } from "discord/presence.js";
import { discordSend, manualDiscordSend } from "discord/util.js";
import { requirePage } from "index.js";
import { addBulletPoints, invalidateListing, Listing } from "listing.js";
import { fbListingXpath } from "platforms/fb/constants.js";
import fb from "platforms/fb/index.js";
import {
  applyFbSessionToContext,
  saveFbSession,
} from "platforms/fb/session.js";
import {
  collectListingInfos,
  fbClick,
  fbType,
  getCurrentRadius,
  isLoggedIn,
  loginChallengeReason,
  setMarketplaceLocation,
} from "platforms/fb/util.js";
import { PlatformKey } from "types/platform.js";
import {
  getSearchConfig,
  isCityWideSearch,
  isRentalSearch,
} from "search.js";
import { PetType, rentalCategory } from "user-config.js";
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
import {
  isNight,
  notUndefined,
  randomWait,
  tryNTimes,
  waitSeconds,
} from "util/misc.js";
import {
  elementShouldExist,
  withCleanPage,
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

const fbGet = async (url: string) => await requirePage().goto(url);

export const perListing = async (l: Listing) => {
  let url = getListingURL(l.id);
  debugLog(`visiting listing: ${url}`);

  let infos: any[] = [];

  const config = await getSearchConfig();
  const isAptSearch = isRentalSearch(config);

  await tryNTimes(3, async () => {
    // Listing detail pages are public, so they're fetched anonymously to keep
    // the logged-in session away from per-listing traffic:
    infos = await withCleanPage(async (page) => {
      await page.goto(url);

      const scripts = await page
        .locator("xpath=//script")
        .all()
        .then((els) => Promise.all(els.map((e) => e.innerHTML().catch(() => ""))));

      // Facebook moved the listing's fields out of marketplace_product_details_page
      // (which now carries only photos and an id), so gather every object on the
      // page belonging to this listing instead:
      const collected = collectListingInfos(scripts, l.id);
      if (collected.length) {
        return collected;
      }

      verboseLog(
        `Found no id-matched data for listing ${l.id}; falling back to marketplace_product_details_page.`
      );
      return scripts
        .map(
          (html) =>
            findNestedJSONProperty(html, "marketplace_product_details_page")
              ?.target
        )
        .filter(notUndefined);
    });

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
        // Fail closed. Throwing here used to abort the whole batch, and treating
        // an unknown age as "fresh" is how month-old listings got sent.
        debugLog(`Couldn't determine the age of listing ${l.id}: ${e}`);
        invalidateListing(
          l,
          "stale",
          "Couldn't determine how old this listing is"
        );
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
      const params = config.params;
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
  const config = await getSearchConfig();

  const city = config.location.city;
  // Marketplace's city-wide feed is the bare city path. Asking for it by an
  // unrecognised slug happens to redirect there, but only by accident — emit the
  // real thing.
  const category = isCityWideSearch(config)
    ? ""
    : config.category ?? rentalCategory;
  const isAptSearch = isRentalSearch(config);

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
      config.params.exclude?.shared && {
        propertyType: ["house", "townhouse", "apartment-condo"].join(","),
      }),
    ...(config.params.price.min !== undefined && {
      minPrice: config.params.price.min,
    }),
    ...(config.params.price.max !== undefined && {
      maxPrice: config.params.price.max,
    }),
    ...(isAptSearch &&
      config.params.minBedrooms !== undefined && {
        minBedrooms: config.params.minBedrooms,
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

  // Facebook answers either by logging us in or by raising a challenge, and a
  // challenge iframe can take a second or two to render — so poll for both
  // instead of assuming which arrives first. Checking only for the logged-in
  // state would report a bare selector timeout and lose the actual reason.
  const deadline = Date.now() + 30 * 1000;
  while (Date.now() < deadline) {
    if (await isLoggedIn()) {
      return;
    }
    const challenge = await loginChallengeReason();
    if (challenge) {
      throw new Error(challenge);
    }
    await waitSeconds(1);
  }

  throw new Error("Facebook didn't complete the login within 30 seconds");
};

const manualLoginPromptIntervalMs = 30 * 60 * 1000;
let lastManualLoginPromptAt: number | undefined;

const manualLoginInstructions = (reason: string) =>
  [
    "🔐 **Facebook needs a manual login.**",
    "",
    reason.endsWith(".") ? reason : `${reason}.`,
    "Marketplace listings will be skipped until a session is available. Other platforms are unaffected.",
    "",
    "On the machine running partmin, from the partmin repo directory:",
    "```",
    "docker compose --profile login run --rm --service-ports fb-login",
    "```",
    "Then, from your own machine:",
    "```",
    "ssh -L 6080:localhost:6080 <your-server>",
    "```",
    "and open <http://localhost:6080/vnc.html?autoconnect=1&resize=scale> to drive the browser directly and complete the login. partmin will pick up the session on its next pass — no restart needed.",
  ].join("\n");

const promptForManualLogin = async (reason: string) => {
  const now = Date.now();
  if (
    lastManualLoginPromptAt !== undefined &&
    now - lastManualLoginPromptAt < manualLoginPromptIntervalMs
  ) {
    log(`Still no Facebook session (${reason}). Already asked for a login.`);
    return;
  }
  lastManualLoginPromptAt = now;

  log(`Facebook needs a manual login: ${reason}`);

  const screenshot = await requirePage()
    .screenshot({ type: "png" })
    .catch((e) => {
      debugLog(`Couldn't screenshot the Facebook login page: ${e}`);
      return undefined;
    });

  await manualDiscordSend({
    content: manualLoginInstructions(reason),
    ...(screenshot && {
      files: [
        new AttachmentBuilder(screenshot, { name: "facebook-login.png" }),
      ],
    }),
  });
};

/**
 * Make sure there's a usable Facebook session, returning false if the bot can't
 * get one on its own. Called before every pass so that a login completed
 * out-of-band (see the fb-login service) is picked up without a restart.
 */
// Every automated login is a real login attempt against Facebook, and a burst
// of failures is what gets an account challenged or locked. One attempt per
// process is enough: past that, a human needs to intervene anyway.
let autoLoginAttempted = false;

export const ensureSession = async (): Promise<boolean> => {
  const page = requirePage();

  await visitFacebook();
  if (await isLoggedIn()) {
    verboseLog("Facebook session is valid.");
    await saveFbSession(page.context());
    return true;
  }

  // Someone may have completed a login out-of-band since the last pass:
  if (await applyFbSessionToContext(page.context())) {
    await visitFacebook();
    if (await isLoggedIn()) {
      log("Picked up a Facebook session completed out-of-band.");
      return true;
    }
    log("The Facebook session found on disk didn't result in a login.");
  }

  log("No valid Facebook session.");

  // An automated login is what triggers the captcha in the first place, so only
  // attempt it when credentials were provided, and give up as soon as Facebook
  // pushes back:
  if (process.env.FB_USER && process.env.FB_PASS && !autoLoginAttempted) {
    autoLoginAttempted = true;
    log("Attempting to log in with the configured credentials...");
    try {
      await login();
      if (await isLoggedIn()) {
        log("Logged into Facebook successfully.");
        await saveFbSession(page.context(), { force: true });
        return true;
      }
      await promptForManualLogin(
        "The automated login didn't result in a logged-in session"
      );
      return false;
    } catch (e) {
      await promptForManualLogin(
        `The automated login failed: ${e instanceof Error ? e.message : e}`
      );
      return false;
    }
  }

  await promptForManualLogin(
    autoLoginAttempted
      ? "The automated login already failed once this run, so it won't be retried"
      : "There's no saved session and no FB_USER/FB_PASS credentials are configured"
  );
  return false;
};

export const getListings = async (): Promise<Listing[]> => {
  verboseLog("Waiting for search page to be ready");
  await elementShouldExist("css", '[aria-label="Search Marketplace"]');
  verboseLog("Search page ready");
  const config = await getSearchConfig();

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
        ...(config.params.exclude?.shared &&
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
  // A missing session mustn't be fatal: the other platforms should keep working
  // while the user completes a login.
  await ensureSession();
};

/**
 * The city-wide feed can't be steered by radius, so there's nothing to tile:
 * visit it once per pass. Marketplace reorders what it shows there between
 * loads, so coverage comes from passes accumulating over time rather than from
 * sweeping the search area — and the filters that feed ignores (price, search
 * area) get applied to the listings once they come back.
 */
const cityWideMain = async (
  processListings: (listings: Listing[]) => Promise<void>,
  radii: Circle[]
) => {
  const activity = startActivity(fb.presenceActivities?.main, 1);
  const anchor = radii[0];
  if (!anchor) {
    log("No search areas are configured, so there's nowhere to centre the feed.");
    return;
  }

  log(`visiting the fb marketplace city-wide feed`);
  await tryNTimes(3, async () => {
    await visitMarketplace(anchor);
    await withDOMChangesBlocked(async () => {
      await elementShouldExist("xpath", fbListingXpath);
      debugLog("Parsing listings...");
      const listings = await getListings();
      verboseLog(
        `found ${listings.length} listings in the city-wide feed: ${listings
          ?.map((l) => l.id)
          .join(", ")}`
      );
      activity?.update(1);
      await processListings(listings);
    });
  });
};

export const main = async (
  processListings: (listings: Listing[]) => Promise<void>
) => {
  if (!(await ensureSession())) {
    log("Skipping Facebook Marketplace until a session is available.");
    return;
  }

  const config = await getSearchConfig();
  const radii = decodeMapDevelopersURL(config.location.mapDevelopersURL);

  if (isCityWideSearch(config)) {
    return await cityWideMain(processListings, radii);
  }

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
