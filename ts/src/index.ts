import dotenv from "dotenv";
import runFacebookLoop from "./fb/index.js";
import { Builder } from "selenium-webdriver";
import { pushover } from "./util/pushover.js";

dotenv.config();

let notifyOnExit = true;
let sigintCount = 0;
process.on("SIGINT", function () {
  if (++sigintCount === 1) {
    console.log("Caught interrupt signal");
    notifyOnExit = false;
  }
});

const main = async () => {
  const driver = await new Builder().forBrowser("chrome").build();
  try {
    runFacebookLoop(driver);
  } catch (e) {
    if (notifyOnExit) {
      console.error(e);
      pushover({
        message: `⚠️ Something went wrong. You will no longer receive notifications.`,
      });
    }
  }
};

main();
