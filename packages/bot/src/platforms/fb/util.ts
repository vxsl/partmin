import { requirePage } from "index.js";
import type { Locator } from "playwright";
import { findEnclosingJSONObjects } from "util/json.js";
import { log } from "util/log.js";
import { waitSeconds as seconds, tryNTimes, waitSeconds } from "util/misc.js";
import {
  click,
  clickByXPath,
  elementShouldExist,
  type,
} from "util/selenium.js";

export const MP_ITEM_XPATH = `.//a[contains(@href,'/marketplace/item/')]`;

// Fields worth anchoring on when hunting for a listing's data in the page. Each
// one lives on a different object in Facebook's payload, so several anchors are
// needed to gather everything perListing reads.
const listingInfoAnchors = [
  "creation_time",
  "redacted_description",
  "listing_photos",
  "pdp_display_sections",
];

/**
 * The JSON objects in a listing page's inline scripts that belong to the given
 * listing.
 *
 * A Marketplace item page embeds many *other* listings too (recommendations,
 * "similar items"), each with its own creation_time — so an object is only
 * trusted when it identifies itself as this listing. Without that check the
 * staleness filter reads a neighbouring listing's timestamp.
 */
export const collectListingInfos = (scripts: string[], id: string): any[] => {
  const candidates: any[] = [];
  for (const script of scripts) {
    for (const anchor of listingInfoAnchors) {
      if (!script.includes(`"${anchor}"`)) {
        continue;
      }
      candidates.push(...findEnclosingJSONObjects(script, anchor));
    }
  }

  return (
    candidates
      .filter((o) => o && typeof o === "object" && String(o.id) === id)
      // richest first, so getPart finds populated fields sooner:
      .sort((a, b) => Object.keys(b).length - Object.keys(a).length)
  );
};

export const marketplaceReady = () =>
  requirePage()
    .locator(`xpath=${MP_ITEM_XPATH}`)
    .count()
    .then((n) => n > 0);

export const dismissBlock = async () => {
  try {
    await requirePage()
      .locator(
        `xpath=//div[@role="dialog"]//*[@aria-label="Close" or @aria-label="OK"]`
      )
      .first()
      .click({ timeout: 2000 });
  } catch {
    // no blocking dialog present
  }
};

// Playwright's click auto-retries for intercepted clicks, but FB occasionally
// shows a blocking dialog. Only call dismissBlock for Playwright's
// pointer-interception error.
const isClickIntercepted = (e: unknown) =>
  e instanceof Error && e.message.includes("intercepts pointer events");

export const fbClick = async (element: Locator) => {
  try {
    await click(element);
  } catch (e) {
    if (isClickIntercepted(e)) {
      await dismissBlock();
      await click(element);
    } else {
      throw e;
    }
  }
};

export const fbType = async (element: Locator, text: string) => {
  try {
    await type(element, text);
  } catch (e) {
    if (isClickIntercepted(e)) {
      await dismissBlock();
      await type(element, text);
    } else {
      throw e;
    }
  }
};

export const isOnHomepage = async () =>
  await requirePage()
    .locator('[aria-label="Search Facebook"]')
    .count()
    .then((n) => n > 0);

/**
 * Whether the browser holds a logged-in Facebook session. Checking the cookie
 * rather than the DOM means this holds true regardless of which Facebook page
 * happens to be open.
 */
export const isLoggedIn = async () =>
  await requirePage()
    .context()
    .cookies("https://www.facebook.com")
    .then((cs) => cs.some((c) => c.name === "c_user" && !!c.value));

const challengeURLFragments: [string, string][] = [
  ["/checkpoint/", "Facebook is showing a security checkpoint"],
  ["two_step_verification", "Facebook is asking for a 2FA code"],
  ["/recover/", "Facebook is asking to recover the account"],
  ["login_attempt", "Facebook is questioning the login attempt"],
];

const challengeSelectors: [string, string][] = [
  ['[name="captcha_response"]', "Facebook is showing a captcha"],
  ['iframe[src*="captcha"]', "Facebook is showing a captcha"],
  ['iframe[src*="recaptcha"]', "Facebook is showing a reCAPTCHA"],
];

/**
 * A human-readable reason if Facebook is blocking the login with a challenge,
 * otherwise undefined. Used to bail out of an automated login attempt instead
 * of hammering a captcha the bot can't solve.
 */
export const loginChallengeReason = async (): Promise<string | undefined> => {
  const page = requirePage();

  const url = page.url();
  for (const [fragment, reason] of challengeURLFragments) {
    if (url.includes(fragment)) {
      return reason;
    }
  }

  for (const [selector, reason] of challengeSelectors) {
    if ((await page.locator(selector).count()) > 0) {
      return reason;
    }
  }

  const securityCheck = await page
    .getByText(/security check|vérification de sécurité/i)
    .count()
    .catch(() => 0);
  if (securityCheck > 0) {
    return "Facebook is showing a security check";
  }

  return undefined;
};

export const getCurrentRadius = () =>
  requirePage()
    .locator(`xpath=//text()[contains(., "Within")]/..`)
    .innerText()
    .then((text) => text.match(/(\d+\.?\d*)\s?(kilomet|km)/)?.[1])
    .then((_r) => {
      if (_r === undefined) {
        throw new Error("Could not validate radius in page");
      }
      return parseFloat(_r);
    });

export const setMarketplaceLocation = async (fsa: string, radius: number) => {
  const page = requirePage();

  // open the modal:
  await elementShouldExist("xpath", `//text()[contains(., "Within")]/..`);
  await seconds(Math.random() * 1 + 1);
  await fbClick(
    page.locator(`xpath=//text()[contains(., "Within")]/..`)
  );

  // make sure the modal is open:
  await elementShouldExist(
    "xpath",
    `//span[contains(text(), "Search by") \
    and (contains(text(), "city") or contains(text(), "town")) \
    and (contains(text(), "ZIP code") or contains(text(), "postal code")) \
    ]`
  );

  await seconds(Math.random() * 1 + 1);

  const locInput = page.locator(`xpath=//input[@aria-label="Location"]`);
  await fbClick(locInput);

  await seconds(Math.random() * 1 + 1);

  await locInput.press("Control+a");
  await locInput.press("Delete");

  await seconds(Math.random() * 1 + 0.5);

  await fbType(locInput, fsa);
  await seconds(1);

  await elementShouldExist(
    "xpath",
    `//span[contains(text(), "Canada ${fsa}")]`
  );

  await locInput.press("ArrowDown");
  await locInput.press("Enter");

  await seconds(Math.random() * 1 + 0.5);

  return await tryNTimes(3, async () => {
    const actualRadius = await getCurrentRadius();
    if (Math.abs(actualRadius - radius) < 0.1) {
      log(
        `Happily, Facebook ended up loaded results for ${actualRadius} km after all.`
      );
      return actualRadius;
    }

    await clickByXPath(`//text()[contains(., "Radius")]/../../../../..`);

    // get all the radii from the text contents of the elements in a role=listbox:
    const radiiEls = await page
      .locator(`xpath=//div[@role="listbox"]//div[@role="option"]`)
      .all();
    const radii = await Promise.all(
      radiiEls.map((r) => r.innerText().then((t) => parseInt(t.trim())))
    );
    // select the radius that's closest to the desired radius:
    const closestRadius = radii.reduce((a, b) =>
      Math.abs(b - radius) < Math.abs(a - radius) ? b : a
    );
    log(
      `Setting the radius to ${closestRadius} km instead of ${radius} km because it's the closest available option in the manual location modal`
    );

    await clickByXPath(
      `//div[@role="listbox"]//div[@role="option" and contains(., '${closestRadius} kilomet')]`
    );

    const actualRadiusAgain = await getCurrentRadius();
    if (Math.abs(actualRadiusAgain - radius) < 0.1) {
      log(
        `Happily, Facebook ended up loaded results for ${actualRadiusAgain} km after all.`
      );
      return actualRadiusAgain;
    }

    await fbClick(page.locator(`xpath=//span[text()="Apply"]`));
    await waitSeconds(2);

    return closestRadius;
  });
};
