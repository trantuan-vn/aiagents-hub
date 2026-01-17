"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { SiweMessage } from "siwe";
import { toast } from "sonner";
import { useAccount, useChainId, useConnect, useSignMessage } from "wagmi";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WalletConnectButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const t = useTranslations("WalletConnect");
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId() || 1;
  const [isSigning, setIsSigning] = useState(false);

  const NonceSchema = useMemo(
    () =>
      z.object({
        nonce: z
          .string()
          .min(1)
          .regex(/^[a-zA-Z0-9]+$/, t("nonce_validation_error")),
      }),
    [t],
  );

  const fetchNonce = useCallback(async () => {
    toast.info(t("preparing_auth"));

    const nonceResponse = await fetch("https://api.unitoken.trade/dashboard/auth/wallet/nonce", {
      method: "GET",
      credentials: "include",
    });

    if (!nonceResponse.ok) {
      const errorText = await nonceResponse.text();
      throw new Error(t("nonce_fetch_error", { error: errorText }));
    }

    const data = await nonceResponse.json();
    // eslint-disable-next-line no-console
    console.log("Phản hồi nonce:", nonceResponse.status, data);
    const result = NonceSchema.parse(data);
    // eslint-disable-next-line no-console
    console.log("Parsed nonce:", result.nonce);

    return result.nonce;
  }, [t, NonceSchema]);

  const createAndSignMessage = useCallback(
    async (nonce: string) => {
      const domain = window.location.host;
      const origin = window.location.origin;
      const statement = "Please sign this message to confirm your identity.";

      const siweMessage = new SiweMessage({
        domain,
        address,
        statement,
        uri: origin,
        version: "1",
        chainId: chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      // eslint-disable-next-line no-console
      console.log("SIWE message:", message);

      toast.info(t("open_wallet_sign"), {
        duration: 5000,
      });

      const signature = await signMessageAsync({ message }).catch((err) => {
        throw new Error(t("sign_failed", { error: err.message }));
      });

      // eslint-disable-next-line no-console
      console.log("Signature:", signature);

      return { message, signature: signature.startsWith("0x") ? signature : `0x${signature}` };
    },
    [address, chainId, signMessageAsync, t],
  );

  const verifyAndConnect = useCallback(
    async (message: string, signature: string) => {
      toast.info(t("verifying_signature"));

      const connectResponse = await fetch("https://api.unitoken.trade/dashboard/auth/wallet/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify({
          message,
          signature,
        }),
        credentials: "include",
      });

      if (!connectResponse.ok) {
        const errorData = await connectResponse.json();
        // eslint-disable-next-line no-console
        console.log("Connect response error:", errorData);
        const errorText = typeof errorData === "string" ? errorData : JSON.stringify(errorData);
        throw new Error(t("connect_failed", { error: errorText }));
      }

      toast.success(t("connect_success"));
      router.push("/dashboard");
    },
    [t, router],
  );

  const handleError = useCallback(
    (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("Lỗi sau kết nối:", error);

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes("sign") && (errorMsg.includes("failed") || errorMsg.includes("thất bại"))) {
          toast.error(t("sign_failed_retry"));
        } else if (errorMsg.includes("user rejected") || errorMsg.includes("người dùng từ chối") || errorMsg.includes("rejected")) {
          toast.error(t("user_rejected_sign"));
        } else {
          toast.error(t("error", { error: error.message }));
        }
      } else {
        toast.error(t("unknown_error"));
      }
    },
    [t],
  );

  const handlePostConnection = useCallback(async () => {
    setIsSigning(true);

    try {
      const nonce = await fetchNonce();
      const { message, signature } = await createAndSignMessage(nonce);
      await verifyAndConnect(message, signature);
    } catch (error) {
      handleError(error);
    } finally {
      setIsSigning(false);
    }
  }, [fetchNonce, createAndSignMessage, verifyAndConnect, handleError]);

  useEffect(() => {
    if (isConnected && address) {
      // eslint-disable-next-line no-console
      console.log("Đã kết nối địa chỉ:", address);
      handlePostConnection();
    }
  }, [isConnected, address, handlePostConnection]);

  const handleWalletConnectLogin = async () => {
    if (isConnected && address) {
      toast.info(t("wallet_connected_preparing"));
      await handlePostConnection();
      return;
    }

    try {
      const injectedConnector = connectors.find((c) => c.id === "injected");
      const walletConnectConnector = connectors.find((c) => c.id === "walletConnect");

      if (injectedConnector && window.ethereum) {
        // eslint-disable-next-line no-console
        console.log("Kết nối bằng injected connector...");
        toast.info(t("open_wallet_accept"));
        await connect({ connector: injectedConnector });
      } else if (walletConnectConnector) {
        // eslint-disable-next-line no-console
        console.log("Kết nối bằng WalletConnect...");
        toast.info(t("opening_walletconnect"));
        await connect({ connector: walletConnectConnector });
      } else {
        toast.error(t("no_wallet_found"));
        // eslint-disable-next-line no-console
        console.error("Không tìm thấy connector injected hoặc walletConnect.");
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Lỗi kết nối ví:", error);

      if (error instanceof Error) {
        if (error.message.includes("User rejected")) {
          toast.error(t("user_rejected_connect"));
        } else {
          toast.error(t("connect_failed_error", { error: error.message }));
        }
      } else {
        toast.error(t("connect_failed_retry"));
      }
    }
  };

  const getButtonText = () => {
    if (isConnecting) return t("connecting");
    if (isSigning) return t("waiting_sign");
    return t("continue_with_walletconnect");
  };

  return (
    <Button
      variant="secondary"
      className={cn(className)}
      onClick={handleWalletConnectLogin}
      disabled={isConnecting || isSigning}
      {...props}
    >
      <img src="/walletconnect.svg" className="mr-2 h-4 w-4" alt="WalletConnect" />
      {getButtonText()}
    </Button>
  );
}
