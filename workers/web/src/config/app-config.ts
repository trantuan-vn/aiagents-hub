import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "AI Agents Hub",
  homeUrl: "https://aiagents-hub.vn/",
  version: packageJson.version,
  copyright: `© ${currentYear}, AI Agents Hub.`,
  meta: {
    title: "AI Agents Hub",
    description:
      "One platform, one Credit, unlimited models. Build AI agents and workflows — pay for completed work, not tokens.",
  },
};
