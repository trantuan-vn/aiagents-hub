import "./indexeddb-polyfill";
import { walletConnect } from "@wagmi/connectors";
import { createConfig, http, cookieStorage, createStorage } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

// Import walletConnect connector
// Webpack alias will handle @react-native-async-storage/async-storage module resolution

// Create connectors function that only runs on client
// This prevents connector initialization during SSR
const createConnectors = () => {
  if (typeof window === "undefined") {
    return [];
  }

  return [
    walletConnect({
      projectId: "c17c648e814a42c99a410355f29b0ad5",
      metadata: {
        name: "Unitoken",
        description: "Unitoken",
        url: "http://beta.unitoken.trade",
        icons: ["http://beta.unitoken.trade/icon.png"],
      },
    }),
  ];
};

export const config = createConfig({
  chains: [mainnet, sepolia],
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
  connectors: createConnectors(),
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
