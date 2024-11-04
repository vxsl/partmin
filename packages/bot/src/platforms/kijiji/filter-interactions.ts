import { requireDriver } from "index.js";
import { ensureFilterIsOpen, getFilterXpath } from "platforms/kijiji/util.js";
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
    public func: (v: V, xpath: string) => void
  ) {}
  static fromObject<V>(obj: {
    id: string;
    getConfigValue: (c: StaticUserConfig) => V;
    noopCondition: (v: V) => boolean;
    func: (v: V, xpath: string) => void;
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

export const doFilter = async <V>(f: FilterDef<V>) => {
  const config = await getUserConfig();
  const v = f.getConfigValue(config);
  if (f.noopCondition(v)) {
    return;
  }
  await ensureFilterIsOpen(f.id);
  await f.func(v, getFilterXpath(f.id));
};

const filterInteractions: FilterInteractionsMap = {
  exclude: {
    basements: FilterDef.fromObject({
      id: "unittype",
      getConfigValue: (c) => c.search.params.exclude?.basements,
      noopCondition: (v) => !v,
      func: (_, xpath) => {
        return clickAllByXPath(`//label[not(text()='Basement')]`, {
          noConcurrency: true,
          parentXpath: `${xpath}/..`,
          afterClick: async () => {
            await waitUntilUrlChanges();
            await requireDriver().sleep(1000);
            await ensureFilterIsOpen("unittype");
          },
        });
      },
    }),
  },
  price: FilterDef.fromObject({
    id: "price",
    getConfigValue: (c) => c.search.params.price,
    noopCondition: (v) => v.min === undefined && v.max === undefined,
    func: async (v, xpath) => {
      await fillInputByLabel("from", v.min, {
        parentXpath: xpath,
      });
      await fillInputByLabel("to", v.max, {
        parentXpath: xpath,
      });
      await clickByXPath(`//button[contains(text(), 'Apply')]`, {
        parentXpath: `${xpath}/..`,
      });
      await waitUntilUrlChanges();
    },
  }),
  minBedrooms: FilterDef.fromObject({
    id: "numberbedrooms",
    getConfigValue: (c) => c.search.params.minBedrooms,
    noopCondition: (v) => v === undefined || v === 0,
    func: async (v, xpath) => {
      for (const p of [
        `//label[number(translate(substring-before(., '+'), ' ', '')) >= ${v}]`,
        `//label[number(translate(., ' ', '')) >= ${v}]`,
      ]) {
        await clickAllByXPath(p, {
          noConcurrency: true,
          parentXpath: `${xpath}/..`,
          afterClick: async () => {
            await waitUntilUrlChanges();
            await requireDriver().sleep(1000);
            await ensureFilterIsOpen("numberbedrooms");
          },
        });
      }
    },
  }),
};

export default filterInteractions;
