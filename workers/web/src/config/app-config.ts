import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Unitoken",
  version: packageJson.version,
  copyright: `© ${currentYear}, Unitoken.`,
  meta: {
    title: "Unitoken",
    description: "Crypto, NFT, and Token Exchange",
  },
};
