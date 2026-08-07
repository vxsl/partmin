## `@partmin` - automating the tedium of your apartment hunt

#### This project is a self-hosted Discord bot that aggregates property rental listings from multiple platforms, sending interactive notifications about new listings that match your criteria.

#### **Listings are retrieved from the following platforms:**

- [Craigslist](https://craigslist.org/)
- [Facebook Marketplace](https://www.facebook.com/marketplace) _**⚠️ requires a one-time manual login — see [Facebook Marketplace setup](#facebook-marketplace-setup).**_
- ~~[Kijiji](https://www.kijiji.ca/)~~ _**⚠️ Kijiji has removed their RSS feature, so this platform is currently disabled.**_

![demo](https://github.com/vxsl/partmin/assets/53827672/bae4c2f9-675a-4329-8f4a-8d85afd74948)

#### **Features include:**

- search with precision by defining multiple search radii:

  - <img src="https://github.com/vxsl/partmin/assets/53827672/1c86e658-3fdd-439d-ad3f-30a8cfb05b85" width="250">
  - _(The app currently relies on the [Map Developers circle-drawing tool](https://www.mapdevelopers.com/draw-circle-tool.php) to draw the radii, but a partmin GUI is coming soon.)_

- commute time estimates are provided for each listing via [Google Maps Distance Matrix API](https://developers.google.com/maps/documentation/distance-matrix/overview):

  - <img src="https://github.com/vxsl/partmin/assets/53827672/0a53ea49-8530-47d4-a2d9-999781818ea7" width="250">

- granular filtering options:

  - number of bedrooms, size, parking, roommates, pet-friendliness, etc.
  - omit basements, sublets, or swaps
  - blacklist specific phrases _(regular expressions supported!)_

- check on the bot's activity by viewing its status:

  - <img src="https://github.com/vxsl/partmin/assets/53827672/22f015f5-ca76-49d4-ba34-d4c91b5ef5e2" width="250">

- run [more than one search](#running-more-than-one-search), each with its own
  channel — including non-rental Marketplace categories

- tweak your search on-the-fly with [slash commands](#discord-commands):
  - <img src="https://github.com/vxsl/partmin/assets/53827672/a7b9b3f0-d775-42ef-b0d3-b3462df7d244" width="650">

---

## Important Notes

- #### Currently, only 🇨🇦 cities are supported.

- #### This project is still in development; be warned that it is not yet 100% stable and may contain bugs.

- #### A Google Maps API key with permissions for the [Geocoding](https://developers.google.com/maps/documentation/geocoding/overview) and [Distance Matrix](https://developers.google.com/maps/documentation/distance-matrix/overview) APIs is required.
  - ##### Please note that the free tier of the Google Maps API has usage limits, but if you're using partmin for personal use, you're unlikely to exceed these limits.
  - ##### You can obtain your API key from the [Google Cloud Console](https://console.cloud.google.com/).

---

## Getting Started

1. **Clone this repository.**

   ```shell
   git clone https://github.com/vxsl/partmin
   ```

1. **Create a file called `.env` in the root directory of the project.**

   ```shell
   cd partmin && touch .env
   ```

1. **Obtain your Discord server's ID by opening Discord, right-clicking your server in the sidebar, and navigating to `Server Settings > Widget > SERVER ID`.**

   Copy and paste the ID in your `.env` file:

   ```
   DISCORD_SERVER_ID=your-server-id
   ```

   _Note that partmin will create channels in this server, so make sure you have the necessary permissions to do so._

1. **Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications/).**

1. **Obtain the bot token from the _Bot_ section of your application's control panel in the developer portal.**

   Copy and paste the token in your `.env` file:

   ```
   DISCORD_BOT_TOKEN=your-bot-token
   ```

1. **Obtain the application ID from the _General Information_ section of your application's control panel in the developer portal.**

   Copy and paste the ID in your `.env` file:

   ```
   DISCORD_APP_ID=your-application-id
   ```

1. **Start partmin.**

   The easiest way is to use Docker Compose:

   ```shell
   docker compose up --build
   ```

   You can also run partmin without Docker, but there will be additional setup required. _(please refer to the [Dockerfile](Dockerfile) for the necessary dependencies):_

   ```shell
   yarn install
   yarn bot
   ```

1. **🚀 Your self-hosted bot is now online! Follow the instructions provided by the bot to configure your search.**

   ![setup](https://github.com/vxsl/partmin/assets/53827672/917a1104-8ef6-44e6-9ecb-d95cefb4169a)

---

## Facebook Marketplace setup

Facebook enforces a captcha on login, which partmin can't solve. Marketplace also
serves different results to logged-out visitors, so a real session is required.

partmin handles this by logging in **as rarely as possible**: the session is saved
to `packages/bot/.data/fb-session.json` (inside the volume-mounted data directory)
and restored on every start, so a login is only needed when there's no session yet
or Facebook has invalidated it. The other platforms keep working regardless — a
missing Facebook session only skips Marketplace.

When a login is needed, partmin posts a message to Discord with a screenshot of what
it's looking at, and waits. To complete the login, run the `fb-login` service, which
serves a real browser over [noVNC](https://novnc.com/):

```shell
docker compose --profile login run --rm --service-ports fb-login
```

Then, from your own machine, forward the port and open it in a browser:

```shell
ssh -L 6080:localhost:6080 your-server
```

<http://localhost:6080/vnc.html?autoconnect=1&resize=scale>

Log in there, solving whatever captcha or 2FA prompt Facebook raises. The helper
detects the session, writes it to disk, and exits. partmin picks it up on its next
Marketplace pass — **no restart required**, and the bot can keep running throughout.

Notes:

- Because the login happens inside the container, the session is created from the
  same IP address and browser build the bot uses. Logging in elsewhere and copying
  the session over tends to get flagged by Facebook.
- The noVNC port is published on the host's loopback interface only, so it isn't
  reachable from outside the machine without the SSH tunnel above.
- If you set `FB_USER` and `FB_PASS` in your `.env`, the helper pre-fills them (and
  the bot will attempt an unattended login, backing off to this flow the moment
  Facebook presents a challenge). They're optional — you can just type the
  credentials into the browser instead.

---

## Running more than one search

By default partmin runs the single search described by the `search` block of
`config/user-config.json` and posts its results to one channel. Adding a
`searches` block gives you additional searches, each with **its own channel and
its own memory of what it has already sent** — useful when you want a separate
feed that isn't your apartment hunt.

Each entry states only what differs from `search`; everything it leaves out is
inherited, so a second search doesn't have to restate your city or your search
radii. For a feed spanning _all_ of Marketplace, leave your existing `search`
block alone and add `searches` alongside it:

```json
  "searches": {
    "deals": {
      "category": "all",
      "platforms": ["fb"],
      "params": { "price": { "min": 0 } },
      "blacklist": []
    }
  }
```

That produces a `🌇┃deals` channel next to your existing listings channel.

Note what that `price` does: both bounds are optional, and because an override
replaces a field outright rather than merging into it, writing only `min` drops
the `max` inherited from `search`. That's usually what you want here — a rent
ceiling makes no sense across every category, and a good deal on something
expensive is still a good deal.

Notes:

- **Names** may use lowercase letters, digits and dashes. The name becomes the
  channel name, so pick something short. Renaming a search creates a new channel
  and leaves the old one behind for you to delete.
- **`platforms`** picks which sites a search covers — one or more of `fb` and
  `craigslist`. Omit it to use all of them. Craigslist is only searched for
  rentals, so a non-rental search should ask for `["fb"]`.
- **`category`** picks what a Facebook search covers. `propertyrentals` (the
  default) is Marketplace's rentals category. `all` is partmin's own name for
  Marketplace's city-wide feed, which spans every category — see below. Any other
  value is used as a literal Marketplace category slug, which is riskier than it
  looks: `electronics` and `free` work, but a slug Marketplace doesn't recognise
  (`musicalinstruments`, `sportinggoods`) silently redirects to the city-wide feed
  instead of failing, and only `propertyrentals` offers a newest-first sort.
- **`"category": "all"` behaves differently from a category page**, because
  Marketplace's city-wide feed accepts none of the filters a category page does.
  It ignores the price and the radius it's given, and it has no sort control at
  all — it's ranked by Facebook, which is the point: it surfaces recent listings
  it thinks are worth seeing. So partmin applies the parts Facebook drops:
  - **price** is checked against `params.price` from the search tile, before
    anything else, so over-priced listings don't eat the per-pass budget
  - **search area** is checked against your radii once a listing's page has been
    visited and its coordinates are known — the feed reaches ~65 km, well past
    most search circles, so this does most of the filtering
  - the feed reorders itself between loads, so coverage builds up over successive
    passes rather than from one sweep. partmin visits it once per pass.
- **Rental-only filters** — `pets`, `minBedrooms`, and the `swaps`, `sublets` and
  `shared` exclusions — are ignored by searches whose `category` isn't
  `propertyrentals`. Listings there also carry less detail, since the fields
  partmin reads for bedrooms, unit size and pet policy are specific to rentals.
- **partmin sends at most 15 new listings per pass per search area**, and
  permanently ignores anything beyond that. This rarely bites a rental search,
  but a busy category can exceed it on every pass — so treat a broad search as a
  sample of what's new rather than an exhaustive feed, and narrow it with
  `price`, a tighter `category` or a smaller radius if you're missing things.
- The `/search-parameters` command edits the `search` block. Extra searches are
  configured by editing the file, which partmin picks up on its next pass — no
  restart needed.

---

## Discord Commands

- `/location`: 📌 What city do you want to live in?
- `/search-areas`: 📌 Specify granular search radii within your city.
- `/commute-destinations`: 📌 Define commute destinations.
- `/search-parameters`: 📄 View and edit your search parameters.
- `/advanced-config`: 📄 View and edit advanced config. _Avoid this unless you know what you're doing._

---

## Contributing

Contributions are welcome! If you have any ideas for new features or improvements, please open an issue or submit a pull request.

## License

This project is licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License](LICENSE).
