import { CommandInteraction } from "discord.js";
import { sendListing } from "discord/interactive/listing/index.js";

export const testListing = (commandInteraction: CommandInteraction) =>
  sendListing(
    {
      platform: "fb",
      id: "1059425985473848",
      details: {
        title: "Shoe rack",
        price: 25,
      },
      url: "https://fb.com/marketplace/item/1059425985473848",
      imgURLs: [
        "https://scontent.fyvr3-1.fna.fbcdn.net/v/t45.5328-4/464535452_2895772200572596_5555876475604276562_n.jpg?stp=c0.43.261.261a_dst-jpg_p261x260&_nc_cat=106&ccb=1-7&_nc_sid=247b10&_nc_ohc=9hDSKtIQVzIQ7kNvgFEShO-&_nc_zt=23&_nc_ht=scontent.fyvr3-1.fna&_nc_gid=Ax2zlJtEgmKGMAn8AVxCWD7&oh=00_AYCgW-WW0VX-o2cURrQ4UHs77AHMoFhkmK0c8Evil2Q3dA&oe=67203D2F",
      ],
      videoURLs: [],
    },
    {
      customSendFn: (o) => commandInteraction.reply({ ...o, fetchReply: true }),
    }
  );

export default testListing;
