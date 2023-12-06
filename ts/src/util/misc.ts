import { stdout as singleLineStdOut } from "single-line-log";

export const waitSeconds = async (s: number) =>
  await new Promise((resolve) => setTimeout(resolve, s * 1000));

export function notUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export const fatalError = (...args: Parameters<typeof console.error>) => {
  console.error(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);
  throw new Error(args[0]);
};

export const errorLog = (...args: Parameters<typeof console.error>) =>
  console.error(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);

export const log = (...args: Parameters<typeof console.log>) =>
  console.log(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);

export const singleLineLog = (...args: Parameters<typeof singleLineStdOut>) =>
  singleLineStdOut(...args);

export const clearSingleLineLog = () => singleLineStdOut.clear();

export const randomWait = async () => {
  const toWait = Math.round(Math.random() * 60 + 60);

  // for toWait seconds, log the number of seconds left, but replace the last line instead of adding a new line:

  var skip = false;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", () => {
    skip = true;
    process.stdin.pause();
    process.stdin.setRawMode(false);
  });
  singleLineLog("\n");
  for (let i = 0; i < toWait; i++) {
    if (skip) break;
    singleLineLog(
      toWait - i === 1
        ? ""
        : `Waiting ${toWait - i} seconds. Press any key to skip wait.`
    );
    await waitSeconds(1);
  }
  process.stdin.setRawMode(false);
  clearSingleLineLog();
  clearSingleLineLog();
  console.log("\n");
};
