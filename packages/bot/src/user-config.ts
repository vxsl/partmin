import {
  Array,
  Boolean,
  Optional,
  Number as RuntypeNumber,
  Record as RuntypeRecord,
  Static,
  String,
} from "runtypes";
import { throwOnUnknownKey } from "util/runtypes.js";
import { RecursivePartial } from "util/type.js";

const configDir = `${process.cwd()}/../../config`;
export const userConfigPath = `${configDir}/user-config.json`;

const UnreliableParams = RuntypeRecord({
  minAreaSqFt: Optional(RuntypeNumber),
  requireOutdoorSpace: Optional(Boolean),
  requireParking: Optional(Boolean),
  petsStrict: Optional(Boolean),
});

export const unreliabilityExplanations: Record<
  keyof Static<typeof UnreliableParams>,
  string
> = {
  // TODO ensure functionality matches these descriptions:
  minAreaSqFt:
    "This will exclude listings that specify a square footage less than the configured value. Posters often report the area of their listing using the wrong units.",
  requireOutdoorSpace:
    "This will exclude listings that don't explicitly offer a yard, balcony, etc. Posters often don't bother to fill out this field, even if their listing has outdoor space.",
  requireParking:
    "This will exclude listings that don't explicitly offer parking. Posters often don't bother to fill out this field, even if their listing has parking.",
  petsStrict:
    "This will exclude listings that don't explicitly allow your type(s) of pet defined in `search.params.pets`. Posters often don't bother to fill out the pets field, even if their listing does allow pets.",
};

const Options = RuntypeRecord({
  commuteDestinations: Optional(Array(String)),
});
const PetParams = RuntypeRecord({
  cat: Optional(Boolean),
  dog: Optional(Boolean),
  other: Optional(Boolean),
});

export type PetType = keyof Static<typeof PetParams>;

export const SearchParams = RuntypeRecord({
  pets: Optional(PetParams),
  exclude: Optional(
    RuntypeRecord({
      basements: Optional(Boolean),
      shared: Optional(Boolean),
      swaps: Optional(Boolean),
      sublets: Optional(Boolean),
    })
  ),
  minBedrooms: Optional(RuntypeNumber),
  price: RuntypeRecord({
    min: RuntypeNumber,
    max: RuntypeNumber,
  }),
  unreliableParams: Optional(UnreliableParams),
});

export const Location = RuntypeRecord({
  city: String,
  region: String,
  mapDevelopersURL: String,
});

export const UserConfig = RuntypeRecord({
  options: Optional(Options),
  search: RuntypeRecord({
    params: SearchParams,
    location: Location,
    blacklist: Optional(Array(String)),
    blacklistRegex: Optional(Array(String)),
  }),
});

export type StaticUserConfig = Static<typeof UserConfig>;

export const defaultUserConfigValues: RecursivePartial<StaticUserConfig> = {
  options: {
    commuteDestinations: [],
  },
  search: {
    params: {
      pets: {
        cat: false,
        dog: false,
        other: false,
      },
      exclude: {
        basements: false,
        shared: false,
        swaps: false,
        sublets: false,
      },
      minBedrooms: 0,
      unreliableParams: {
        minAreaSqFt: 0,
        requireOutdoorSpace: false,
        requireParking: false,
        petsStrict: false,
      },
    },
    blacklist: [],
    blacklistRegex: [],
  },
} as const;

// process.argv.slice(2).forEach((arg) => {
//   const [_key, value] = arg.split("=");
//   if (_key && value) {
//     const key = _key.split("--")[1];
//     const path = key?.split(".") ?? [];
//     let obj: any = _config;
//     for (let i = 0; i < path.length - 1; i++) {
//       const p = path[i];
//       if (p === undefined) break;
//       obj = obj[p];
//     }
//     const lastKey = path[path.length - 1];
//     if (lastKey === undefined) {
//       console.error("Unexpected config key", key);
//       return;
//     }
//     let v;
//     if (value === "true" || value === "false") {
//       v = value === "true";
//     } else if (!isNaN(Number(value))) {
//       v = Number(value);
//     } else {
//       v = value;
//     }

//     console.log(
//       `Overriding config value ${key}: ${v} (original value ${obj[lastKey]})`
//     );
//     obj[lastKey] = v;
//   }
// });

export const validateUserConfig = (c: StaticUserConfig) => {
  try {
    UserConfig.check(c);
  } catch (e) {
    console.error("Invalid config.");
    throw e;
  }

  throwOnUnknownKey(UserConfig.fields, c, {
    message: "Unexpected config option",
  });

  c.search.blacklistRegex?.forEach((r) => {
    try {
      new RegExp(r);
    } catch (e) {
      throw new Error(`Invalid blacklistRegex in config: ${r}`);
    }
  });

  if (c.search.params.price.min > c.search.params.price.max) {
    throw new Error("min price is greater than max price");
  }
};
