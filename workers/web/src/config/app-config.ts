import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "APIHub - Unitoken",
  version: packageJson.version,
  copyright: `© ${currentYear}, Unitoken.`,
  meta: {
    title: "APIHub - Unitoken",
    description: "APIHub - Unitoken - API Management Platform",
  },
};
