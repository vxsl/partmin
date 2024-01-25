import { WebDriver } from "selenium-webdriver";
import { Config } from "config.js";
import { Item } from "types/item.js";

// main: (c: Config, d: WebDriver) => Promise<Item[] | undefined>;
// pre?: (c: Config, d: WebDriver, configChanged?: boolean) => Promise<void>;
// perItem?: (c: Config, d: WebDriver, i: Item) => Promise<void>;

export type PlatformKey = "kijiji" | "fb";
export type Platform = {
  key: PlatformKey;
  main: (c: Config, d: WebDriver) => Promise<Item[] | undefined>;
  pre?: (c: Config, d: WebDriver, configChanged?: boolean) => Promise<void>;
  perItem?: (c: Config, d: WebDriver, i: Item) => Promise<void>;
};
