import {
  Array,
  Boolean,
  Dictionary,
  Literal,
  Optional,
  Number as RuntypeNumber,
  Record as RuntypeRecord,
  Static,
  String,
  Union,
} from "runtypes";
import { throwOnUnknownKey } from "util/runtypes.js";
import { RecursivePartial } from "util/type.js";

const configDir = `${process.cwd()}/../../config`;
export const userConfigPath = `${configDir}/user-config.json`;

// The name of the search defined by the `search` block. Its Discord channel and
// its seen-listing state predate named searches, so it keeps the un-suffixed
// names both of those have always used.
export const primarySearchName = "listings";

// Facebook's category slug for apartment rentals, which also serves as
// partmin's marker for "this search is looking for a place to live" — the
// rental-specific filters and listing fields only apply to that kind of search.
export const rentalCategory = "propertyrentals";

export const PlatformKeyRuntype = Union(
  Literal("kijiji"),
  Literal("fb"),
  Literal("craigslist")
);
export type PlatformKey = Static<typeof PlatformKeyRuntype>;

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
  minAreaSqFt:
    "This will exclude listings that specify a square footage less than the configured value. Posters often report the area of their listing using the wrong units.",
  requireOutdoorSpace:
    "This will exclude listings that don't explicitly offer a yard, balcony, etc. Posters often don't bother to fill out this field, even if their listing has outdoor space.",
  requireParking:
    "This will exclude listings that don't explicitly offer parking. Posters often don't bother to fill out this field, even if their listing has parking.",
  petsStrict:
    "This will exclude listings that don't explicitly allow your type(s) of pet defined in `search.params.pets`. Posters often don't bother to fill out the pets field, even if their listing does allow pets.",
};

const PetParams = RuntypeRecord({
  cat: Optional(Boolean),
  dog: Optional(Boolean),
  other: Optional(Boolean),
});

export type PetType = keyof Static<typeof PetParams>;

const Price = RuntypeRecord({
  min: RuntypeNumber,
  max: RuntypeNumber,
});

const ExcludeParams = RuntypeRecord({
  basements: Optional(Boolean),
  shared: Optional(Boolean),
  swaps: Optional(Boolean),
  sublets: Optional(Boolean),
});

// Split around `price` so that SearchParams and its override counterpart share
// these fields without reordering them: the interactive editor lists parameters
// in declaration order.
const searchParamsBeforePrice = {
  pets: Optional(PetParams),
  exclude: Optional(ExcludeParams),
  minBedrooms: Optional(RuntypeNumber),
};
const searchParamsAfterPrice = {
  unreliableParams: Optional(UnreliableParams),
};

export const SearchParams = RuntypeRecord({
  ...searchParamsBeforePrice,
  price: Price,
  ...searchParamsAfterPrice,
});
const SearchParamsOverride = RuntypeRecord({
  ...searchParamsBeforePrice,
  price: Optional(Price),
  ...searchParamsAfterPrice,
});

export const Location = RuntypeRecord({
  city: String,
  region: String,
  mapDevelopersURL: String,
  commuteDestinations: Optional(Array(String)),
});
const LocationOverride = RuntypeRecord({
  city: Optional(String),
  region: Optional(String),
  mapDevelopersURL: Optional(String),
  commuteDestinations: Optional(Array(String)),
});

export const Search = RuntypeRecord({
  category: Optional(String),
  platforms: Optional(Array(PlatformKeyRuntype)),
  params: SearchParams,
  location: Location,
  blacklist: Optional(Array(String)),
  blacklistRegex: Optional(Array(String)),
});

// An entry in `searches` states only what differs from `search`, so a second
// search doesn't have to restate the location. Every field it does set replaces
// the corresponding one from `search` outright — nested objects aren't merged
// key-by-key.
export const SearchOverride = RuntypeRecord({
  category: Optional(String),
  platforms: Optional(Array(PlatformKeyRuntype)),
  params: Optional(SearchParamsOverride),
  location: Optional(LocationOverride),
  blacklist: Optional(Array(String)),
  blacklistRegex: Optional(Array(String)),
});

export const UserConfig = RuntypeRecord({
  search: Search,
  searches: Optional(Dictionary(SearchOverride, String)),
});

export type StaticSearch = Static<typeof Search>;
export type StaticSearchOverride = Static<typeof SearchOverride>;
export type StaticUserConfig = Static<typeof UserConfig>;

export const defaultUserConfigValues: RecursivePartial<StaticUserConfig> = {
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

// A search's name becomes a Discord channel name and a directory name, and
// mustn't collide with the channels partmin already manages.
const reservedSearchNames = ["listings", "logs", "main-category"];
const searchNamePattern = /^[a-z0-9][a-z0-9-]{0,30}$/;

export const validateSearchName = (name: string) => {
  if (!searchNamePattern.test(name)) {
    throw new Error(
      `Invalid search name "${name}" in searches. A name must be 1-31 characters of lowercase letters, digits and dashes, starting with a letter or digit.`
    );
  }
  if (reservedSearchNames.includes(name)) {
    throw new Error(`searches can't use the reserved name "${name}".`);
  }
};

const validateSearch = (
  s: StaticSearch | StaticSearchOverride,
  label: string
) => {
  s.blacklistRegex?.forEach((r) => {
    try {
      new RegExp(r);
    } catch (e) {
      throw new Error(`Invalid blacklistRegex in ${label}: ${r}`);
    }
  });

  const price = s.params?.price;
  if (price && price.min > price.max) {
    throw new Error(`min price is greater than max price in ${label}`);
  }
};

export const validateUserConfig = (c: any) => {
  try {
    const validated = UserConfig.check(c);

    throwOnUnknownKey(UserConfig.fields, c, {
      message: "Unexpected config option",
    });

    validateSearch(validated.search, "search");

    for (const [name, override] of Object.entries(validated.searches ?? {})) {
      validateSearchName(name);
      // Runtypes ignores extra keys, and throwOnUnknownKey doesn't descend into
      // a Dictionary, so each override has to be checked on its own.
      throwOnUnknownKey(SearchOverride.fields, override, {
        message: `Unexpected config option in searches.${name}`,
      });
      validateSearch(override, `searches.${name}`);
    }
  } catch (e) {
    console.error("Invalid config.");
    throw e;
  }
};
