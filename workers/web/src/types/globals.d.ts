declare module "*.css" {
  const content: any;
  export default content;
}

declare module "*.scss" {
  const content: any;
  export default content;
}

declare module "*.sass" {
  const content: any;
  export default content;
}

declare module "*.less" {
  const content: any;
  export default content;
}

// Extend Window interface to include ethereum property from MetaMask and other wallet extensions
interface Window {
  ethereum?: {
    isMetaMask?: boolean;
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    [key: string]: unknown;
  };
}
