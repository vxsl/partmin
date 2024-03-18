## `@partmin` - automating the tedium of your apartment hunt.

#### This project is a self-hosted Discord bot that aggregates property rental listings from multiple platforms, sending interactive notifications about new listings that match your criteria.

#### **Listings are retrieved from the following platforms:**

- [Kijiji](https://www.kijiji.ca/)
- [Facebook Marketplace](https://www.facebook.com/marketplace)
- ~~[Craiglist](https://montreal.craigslist.org/)~~ _(coming soon!)_

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

- tweak your search on-the-fly with [slash commands](#discord-commands)
- check on the bot's activity by viewing its status:
  - <img src="https://github.com/vxsl/partmin/assets/53827672/22f015f5-ca76-49d4-ba34-d4c91b5ef5e2" width="250">

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
   DISCORD_TOKEN=your-bot-token
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
