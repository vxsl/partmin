import haversine from "haversine";
import { startActivity } from "discord/presence.js";
import { requirePage } from "index.js";
import { Listing, invalidateListing } from "listing.js";
import { getCraigslistBaseURL } from "platforms/craigslist/constants.js";
import craigslist from "platforms/craigslist/index.js";
import { getSearchConfig, maxListingAgeMinutes } from "search.js";
import { getGoogleMapsLink, getSearchCircles, trimAddress } from "util/geo.js";
import { log } from "util/log.js";
import { isNight } from "util/misc.js";

const KM_PER_MILE = 1.60934;

export const main = async (
  processListings: (listings: Listing[]) => Promise<void>
): Promise<void> => {
  const config = await getSearchConfig();
  const city = config.location.city;

  const searchURL = new URL(`${getCraigslistBaseURL(city)}/search/apa`);
  searchURL.searchParams.set("sort", "date");

  if (config.params.price.min !== undefined) {
    searchURL.searchParams.set("min_price", String(config.params.price.min));
  }
  if (config.params.price.max !== undefined) {
    searchURL.searchParams.set("max_price", String(config.params.price.max));
  }
  if (config.params.minBedrooms !== undefined) {
    searchURL.searchParams.set(
      "min_bedrooms",
      String(config.params.minBedrooms)
    );
  }

  // Add geo filter derived from the configured search circles
  const circles = await getSearchCircles();
  if (circles.length > 0) {
    const centerLat = circles.reduce((s, c) => s + c.lat, 0) / circles.length;
    const centerLon = circles.reduce((s, c) => s + c.lon, 0) / circles.length;
    const boundingRadiusKm = Math.max(
      ...circles.map((c) => {
        const distKm = haversine(
          { latitude: centerLat, longitude: centerLon },
          { latitude: c.lat, longitude: c.lon },
          { unit: "km" }
        );
        return distKm + c.radius;
      })
    );
    const boundingRadiusMiles = Math.ceil(boundingRadiusKm / KM_PER_MILE);
    searchURL.searchParams.set("lat", centerLat.toFixed(4));
    searchURL.searchParams.set("lon", centerLon.toFixed(4));
    searchURL.searchParams.set("search_distance", String(boundingRadiusMiles));
  }

  const searchURLStr = searchURL.toString();
  log(`Scraping Craigslist search page: ${searchURLStr}`);
  startActivity(craigslist.presenceActivities?.main, -1);

  const page = requirePage();
  await page.goto(searchURLStr, { waitUntil: "domcontentloaded" });

  const listings: Listing[] = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(".cl-static-search-result")
    ).map((li) => {
      const url = li.querySelector("a")?.href ?? "";
      const id = url.split("/").pop()?.replace(".html", "") ?? "";
      const priceText = li.querySelector(".price")?.textContent?.trim() ?? "";
      const price = parseInt(priceText.replace(/[$,]/g, "")) || undefined;
      const title = li.getAttribute("title") ?? id;
      return {
        platform: "craigslist",
        id,
        url,
        details: { title, price },
        imgURLs: [],
        videoURLs: [],
      } as any;
    });
  });

  log(`Found ${listings.length} listings on search page`);
  await processListings(listings);
};

export const perListing = async (l: Listing) => {
  const page = requirePage();
  await page.goto(l.url);

  const maxMin = maxListingAgeMinutes(await getSearchConfig(), {
    defaultMinutes: isNight() ? 60 : 30,
  });

  try {
    const dateEl = page.locator("time.date").first();
    const dateStr = await dateEl.getAttribute("datetime");
    if (dateStr) {
      const date = new Date(dateStr);
      l.details.date = Math.floor(date.getTime() / 1000);
      if (Date.now() - date.getTime() > maxMin * 60 * 1000) {
        invalidateListing(
          l,
          "stale",
          `Listing is older than ${maxMin} minutes`
        );
      }
    }
  } catch {
    // TODO
  }

  try {
    const imgs = await page.locator(".swipe-wrap img").all();
    const srcs = await Promise.all(imgs.map((img) => img.getAttribute("src")));
    const validSrcs = srcs.filter(Boolean) as string[];
    if (validSrcs.length) {
      l.imgURLs = validSrcs;
    }
  } catch {
    // TODO
  }

  try {
    const descEl = page.locator("#postingbody");
    l.details.longDescription = await descEl.innerText();
  } catch {
    // TODO
  }

  try {
    const mapEl = page.locator("#map");
    const lat = await mapEl.getAttribute("data-latitude");
    const lon = await mapEl.getAttribute("data-longitude");
    if (lat && lon) {
      l.details.coords = { lat: parseFloat(lat), lon: parseFloat(lon) };
    }
  } catch {
    // TODO
  }

  try {
    const addrEl = page.locator(".mapaddress");
    const address = await addrEl.innerText();
    if (address) {
      l.details.shortAddress = await trimAddress(address);
      l.details.longAddress = address;
      l.computed = {
        ...(l.computed ?? {}),
        locationLinkText: l.details.shortAddress,
        locationLinkURL: getGoogleMapsLink(address),
      };
    }
  } catch {
    // TODO
  }
};
