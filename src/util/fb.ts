import { By, WebDriver } from "selenium-webdriver";

export const isOnHomepage = async (driver: WebDriver) =>
  driver
    .findElements(By.css('[aria-label="Search Facebook"]'))
    .then((els) => els.length > 0);
