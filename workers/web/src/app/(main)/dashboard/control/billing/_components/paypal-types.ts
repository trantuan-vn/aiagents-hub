export interface PaypalButtonsActions {
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void> | void;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
  style?: Record<string, unknown>;
}

export interface PaypalButtonsInstance {
  render: (container: HTMLElement) => Promise<void>;
  close: () => void;
}

export interface PaypalNamespace {
  Buttons: (actions: PaypalButtonsActions) => PaypalButtonsInstance;
}

declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}
