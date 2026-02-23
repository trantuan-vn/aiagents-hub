// const DEBUG = process.env.NODE_ENV === "development";
const DEBUG = true;
export const log = (...args: unknown[]) => DEBUG && console.log("[eKYC]", ...args);
