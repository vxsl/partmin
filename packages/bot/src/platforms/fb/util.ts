import { requireDriver } from "index.js";
import { By, error, Key, WebElementPromise } from "selenium-webdriver";
import { log } from "util/log.js";
import { waitSeconds as seconds, waitSeconds } from "util/misc.js";
import {
  click,
  clickByXPath,
  elementShouldExist,
  type,
} from "util/selenium.js";

export const MP_ITEM_XPATH = `.//a[contains(@href,'/marketplace/item/')]`;

export const marketplaceReady = () =>
  requireDriver()
    .findElements(By.xpath(MP_ITEM_XPATH))
    .then((els) => els.length > 0);

export const dismissBlock = () =>
  clickByXPath(
    `//div[@role="dialog"]//*[@aria-label="Close" or @aria-label="OK"]`
  );

export const fbClick = async (element: WebElementPromise) => {
  try {
    await click(element);
  } catch (e) {
    if (e instanceof error.ElementClickInterceptedError) {
      await dismissBlock();
      await click(element);
    }
  }
};

export const fbType = async (element: WebElementPromise, text: string) => {
  try {
    await type(element, text);
  } catch (e) {
    if (e instanceof error.ElementClickInterceptedError) {
      await dismissBlock();
      await type(element, text);
    }
  }
};

export const isOnHomepage = async () =>
  await requireDriver()
    .findElements(By.css('[aria-label="Search Facebook"]'))
    .then((els) => els.length > 0);

export const setMarketplaceLocation = async (fsa: string, radius: number) => {
  const driver = requireDriver();

  // open the modal:
  await elementShouldExist("xpath", `//text()[contains(., "Within")]/..`);
  await seconds(Math.random() * 1 + 1);
  await fbClick(
    driver.findElement(By.xpath(`//text()[contains(., "Within")]/..`))
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

  const locInput = driver.findElement(
    By.xpath(`//input[@aria-label="Location"]`)
  );
  await fbClick(locInput);

  await seconds(Math.random() * 1 + 1);

  await locInput.sendKeys(Key.CONTROL + "a");
  await locInput.sendKeys(Key.DELETE);

  await seconds(Math.random() * 1 + 0.5);

  await fbType(locInput, fsa);
  await seconds(1);

  await elementShouldExist(
    "xpath",
    `//span[contains(text(), "Canada ${fsa}")]`
  );

  await locInput.sendKeys(Key.DOWN);
  await locInput.sendKeys(Key.ENTER);

  await seconds(Math.random() * 1 + 0.5);

  await clickByXPath(`//text()[contains(., "Radius")]/..`);

  // get all the radii from  the text contents of the elements in a role=listbox:
  const radiiEls = await driver.findElements(
    By.xpath(`//div[@role="listbox"]//div[@role="option"]`)
  );
  const radii = await Promise.all(
    radiiEls.map((r) => r.getText().then((t) => parseInt(t.trim())))
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

  await fbClick(driver.findElement(By.xpath(`//span[text()="Apply"]`)));
  await waitSeconds(2);

  return closestRadius;
};
