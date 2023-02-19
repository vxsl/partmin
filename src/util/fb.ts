import { By, until, WebDriver } from "selenium-webdriver";
import { click, type } from "./selenium.js";

export const MP_ITEM_XPATH = `.//a[contains(@href,'/marketplace/item/')]`;

export const isOnHomepage = async (driver: WebDriver) =>
  driver
    .findElements(By.css('[aria-label="Search Facebook"]'))
    .then((els) => els.length > 0);

export const setMarketplaceLocation = async (
  driver: WebDriver,
  fsa: string,
  radius: number
) => {
  // open the modal:
  await click(
    driver.findElement(By.xpath(`//span[(text()="Within 1 kilometer")]`))
  );

  // make sure the modal is open:
  await driver.wait(
    until.elementLocated(
      By.xpath(
        `//span[contains(text(), "Search by city, neighborhood or ZIP code.")]`
      )
    ),
    10 * 1000
  );

  const locInput = driver.findElement(
    By.xpath(`//input[@aria-label="Enter a city"]`)
  );
  await click(locInput);
  await locInput.clear();
  await type(fsa, locInput);

  await click(
    driver.findElement(By.xpath(`//span[contains(text(), "Change location")]`))
  );

  const url = await driver.getCurrentUrl();

  await driver.get(`${url}&radius=${radius}`);

  await driver.wait(
    until.elementLocated(
      By.xpath(
        // `//span[contains(text(), "Within ${String(radius).slice(0, 3)}}")]`
        // `//span[(text()="Within ${radius} kilometers")]`
        `//span[(text()="Within ${
          radius > 1 ? `${radius} kilometers` : `${radius} kilometer`
        }")]`
      )
    ),
    10 * 1000
  );
};
