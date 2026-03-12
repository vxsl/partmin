import { requirePage } from "index.js";
import type { Locator } from "playwright";
import { log } from "util/log.js";
import { waitSeconds as seconds, tryNTimes, waitSeconds } from "util/misc.js";
import {
  click,
  clickByXPath,
  elementShouldExist,
  type,
} from "util/selenium.js";

export const MP_ITEM_XPATH = `.//a[contains(@href,'/marketplace/item/')]`;

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
