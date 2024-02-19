import { ensureFilterIsOpen, getFilterXpath } from "platforms/kijiji/util.js";
import { WebDriver } from "selenium-webdriver";
import { StaticUserConfig } from "user-config.js";
import { getUserConfig } from "util/config.js";
import {
  clickAllByXPath,
  clickByXPath,
  fillInputByLabel,
  waitUntilUrlChanges,
} from "util/selenium.js";

export class FilterDef<V> {
  constructor(
    public id: string,
    public getConfigValue: (c: StaticUserConfig) => V,
    public noopCondition: (v: V) => boolean,
    public func: (d: WebDriver, v: V, xpath: string) => void
  ) {}
  static fromObject<V>(obj: {
    id: string;
    getConfigValue: (c: StaticUserConfig) => V;
    noopCondition: (v: V) => boolean;
    func: (d: WebDriver, v: V, xpath: string) => void;
  }) {
    return new FilterDef(
      obj.id,
      obj.getConfigValue,
      obj.noopCondition,
      obj.func
    );
  }
}

type RecursiveMap<O> = {
  [K in keyof O]?: NonNullable<O[K]> extends object
    ? O[K] extends any[]
      ? FilterDef<O[K]>
      : RecursiveMap<O[K]> | FilterDef<O[K]>
    : FilterDef<O[K]>;
};

export type FilterInteractionsMap = RecursiveMap<
  StaticUserConfig["search"]["params"]
>;

export const doFilter = async <V>(d: WebDriver, f: FilterDef<V>) => {
  const config = await getUserConfig();
  const v = f.getConfigValue(config);
  if (f.noopCondition(v)) {
    return;
  }
  await ensureFilterIsOpen(f.id, d);
  await f.func(d, v, getFilterXpath(f.id));
};

const filterInteractions: FilterInteractionsMap = {
  exclude: {
    basements: FilterDef.fromObject({
      id: "unittype",
      getConfigValue: (c) => c.search.params.exclude?.basements,
      noopCondition: (v) => !v,
      func: (d, _, xpath) =>
        clickAllByXPath(d, `//label[not(text()='Basement')]`, {
          noConcurrency: true,
          parentXpath: `${xpath}/..`,
          afterClick: async () => {
            await waitUntilUrlChanges(d);
            await d.sleep(1000);
            await ensureFilterIsOpen("unittype", d);
          },
        }),
    }),
  },
  price: FilterDef.fromObject({
    id: "price",
    getConfigValue: (c) => c.search.params.price,
    noopCondition: (v) => v.min === undefined && v.max === undefined,
    func: async (d, v, xpath) => {
      await fillInputByLabel(d, "from", v.min, {
        parentXpath: xpath,
      });
      await fillInputByLabel(d, "to", v.max, {
        parentXpath: xpath,
      });
      await clickByXPath(d, `//button[contains(text(), 'Apply')]`, {
        parentXpath: `${xpath}/..`,
      });
      await waitUntilUrlChanges(d);
    },
  }),
  minBedrooms: FilterDef.fromObject({
    id: "numberbedrooms",
    getConfigValue: (c) => c.search.params.minBedrooms,
    noopCondition: (v) => v === undefined || v === 0,
    func: async (d, v, xpath) => {
      for (const p of [
        `//label[number(translate(substring-before(., '+'), ' ', '')) >= ${v}]`,
        `//label[number(translate(., ' ', '')) >= ${v}]`,
      ]) {
        await clickAllByXPath(d, p, {
          noConcurrency: true,
          parentXpath: `${xpath}/..`,
          afterClick: async () => {
            await waitUntilUrlChanges(d);
            await d.sleep(1000);
            await ensureFilterIsOpen("numberbedrooms", d);
          },
        });
      }
    },
  }),
};

export default filterInteractions;
