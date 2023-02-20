export const waitSeconds = async (s: number) =>
  new Promise((resolve) => setTimeout(resolve, s * 1000));
