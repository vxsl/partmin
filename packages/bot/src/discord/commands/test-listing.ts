import { CommandInteraction } from "discord.js";
import { sendListing } from "discord/interactive/listing/index.js";

export const testListing = (commandInteraction: CommandInteraction) =>
  sendListing(
    {
      platform: "fb",
      id: "895554022153211",
      details: {
        title: "43 inch Panasonic TV",
        price: 0,
        date: 1729712125,
        longDescription: "10 years old, works well, can not get Netflix ",
        coords: {
          lat: 49.270935058594,
          lon: -123.11828613281,
        },
      },
      url: "https://fb.com/marketplace/item/895554022153211",
      imgURLs: [
        "https://scontent.fyvr3-1.fna.fbcdn.net/v/t45.5328-4/464069723_1545944502961164_7634367415219989251_n.jpg?stp=dst-jpg_s960x960&_nc_cat=111&ccb=1-7&_nc_sid=247b10&_nc_ohc=JTK95Hm8HncQ7kNvgE-nudD&_nc_ht=scontent.fyvr3-1.fna&_nc_gid=AKmU-nd0ERDogajI6CfSQBY&oh=00_AYAE4tCmcJ5NxZeVEO4RaMOknUJS1xNxLvbjAh_BGevt0w&oe=671F1B7D",
      ],
      videoURLs: [],
    },
    {
      customSendFn: (o) => commandInteraction.reply({ ...o, fetchReply: true }),
    }
  );

export default testListing;
