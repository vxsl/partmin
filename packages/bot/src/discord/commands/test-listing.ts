import { CommandInteraction } from "discord.js";
import { sendListing } from "discord/interactive/listing/index.js";

export const testListing = (commandInteraction: CommandInteraction) =>
  sendListing(
    {
      platform: "fb",
      id: "486998687628625",
      details: {
        title: "Small freezer",
        price: 150,
        date: 1729711044,
        longDescription: "Used but good condition",
        coords: {
          lat: 49.237976074219,
          lon: -123.01940917969,
        },
      },
      url: "https://fb.com/marketplace/item/486998687628625",
      imgURLs: [
        "https://scontent.fyvr3-1.fna.fbcdn.net/v/t45.5328-4/464437586_1511084706278515_1156188587751859028_n.jpg?stp=dst-jpg_s960x960&_nc_cat=108&ccb=1-7&_nc_sid=247b10&_nc_ohc=zN0UqEZJ5nUQ7kNvgGjtxKY&_nc_zt=23&_nc_ht=scontent.fyvr3-1.fna&_nc_gid=AU9a0Bt7lrO47YxdqCmk46Z&oh=00_AYCg2mRl7XqIz7_mx4jhkNrdvq7bVRQnOgRdZ5GIQJswZQ&oe=671F09C5",
      ],
      videoURLs: [],
      computed: {
        locationLinkIsApproximate: true,
        locationLinkText: "5138 Smith Ave, undefined",
        locationLinkURL:
          "https://www.google.com/maps/search/?api=1&query=5138%20Smith%20Ave%2C%20Burnaby%2C%20BC%20V5G%202R4%2C%20Canada",
        commuteDestinations: {
          "4504 Earles St, Vancouver, BC V5R 3P9, Canada": {
            driving: "5 mins",
          },
        },
      },
    },
    {
      customSendFn: (o) => commandInteraction.reply({ ...o, fetchReply: true }),
    }
  );

export default testListing;
