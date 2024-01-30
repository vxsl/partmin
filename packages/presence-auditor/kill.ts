import * as Discord from "discord.js";
import dotenv from "dotenv-mono";

process.title = "partmin-presence-auditor-kill";

dotenv.load();
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  throw new Error("No DISCORD_BOT_TOKEN environment variable provided");
}

(() => {
  const c = new Discord.Client({ intents: 0 });
  console.log("Logging in...");
  c.login(token);
  c.on("ready", (c) => {
    console.log("Logged in. Setting presence to invisible");
    c.user.setPresence({ status: "invisible" });
    console.log("Done. Logging out...");
    c.destroy().then(() => {
      console.log("Done. Exiting");
      process.exit();
    });
  });
})();
