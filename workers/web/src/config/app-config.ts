import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "AI Agents Hub",
  homeUrl: "https://aiagents-hub.vn/",
  version: packageJson.version,
  copyright: `© ${currentYear}, Unitoken.`,
  meta: {
    title: "AI Agents Hub",
    description: "AI Agents Hub - API Management Platform",
  },
};
