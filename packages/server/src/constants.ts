import fs from "fs";
export const tmpDir = `${process.cwd()}/.tmp`;
export const chromeVersion = "120.0.6099.109";
export const puppeteerCacheDir = `${process.cwd()}/.puppeteer`;

[tmpDir, puppeteerCacheDir].forEach((dir) => {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }
});
