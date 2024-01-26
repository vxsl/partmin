import { WebDriver } from "selenium-webdriver";
import { Item } from "item.js";

export type PlatformKey = "kijiji" | "fb";
export type Platform = {
  key: PlatformKey;
  main: (d: WebDriver) => Promise<Item[] | undefined>;
  pre?: (d: WebDriver, configChanged?: boolean) => Promise<void>;
  perItem?: (d: WebDriver, i: Item) => Promise<void>;
};
