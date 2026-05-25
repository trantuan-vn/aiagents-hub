"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { SiweMessage } from "siwe";
import { toast } from "sonner";
import { useAccount, useChainId, useConnect, useSignMessage } from "wagmi";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { buildAuthClientHeaders } from "@/lib/auth-client-headers";
import { cn } from "@/lib/utils";

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";

export function WalletConnectButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const t = useTranslations("WalletConnect");
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
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

    const url = new URL(`${AUTH_API_URL}/wallet/nonce`);
    if (ref) url.searchParams.set("ref", ref);
    const nonceResponse = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: buildAuthClientHeaders(),
    });

    if (!nonceResponse.ok) {
      const errorText = await nonceResponse.text();
      throw new Error(t("nonce_fetch_error", { error: errorText }));
    }

    const data = await nonceResponse.json();
    const result = NonceSchema.parse(data);

    return result.nonce;
  }, [t, NonceSchema, ref]);

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

      toast.info(t("open_wallet_sign"), {
        duration: 5000,
      });

      const signature = await signMessageAsync({ message }).catch((err) => {
        throw new Error(t("sign_failed", { error: err.message }));
      });

      return { message, signature: signature.startsWith("0x") ? signature : `0x${signature}` };
    },
    [address, chainId, signMessageAsync, t],
  );

  const verifyAndConnect = useCallback(
    async (message: string, signature: string) => {
      toast.info(t("verifying_signature"));

      const connectResponse = await fetch(`${AUTH_API_URL}/wallet/connect`, {
        method: "POST",
        headers: {
          ...buildAuthClientHeaders(),
          "Content-Type": "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify({
          message,
          signature,
        }),
        credentials: "include",
      });

      const data = (await connectResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        requiresTotp?: boolean;
        requiresSms?: boolean;
        error?: string;
      };

      if (data.requiresTotp) {
        toast.success(t("totp_required"));
        router.replace("/auth/v3/login?requiresTotp=1");
        return;
      }
      if (data.requiresSms) {
        toast.success(t("sms_required"));
        router.replace("/auth/v3/login?requiresSms=1");
        return;
      }

      if (!connectResponse.ok) {
        const errorText = typeof data === "string" ? data : (data.error ?? JSON.stringify(data));
        throw new Error(t("connect_failed", { error: errorText }));
      }

      toast.success(t("connect_success"));
      router.push("/dashboard");
    },
    [t, router],
  );

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes("sign") && (errorMsg.includes("failed") || errorMsg.includes("thất bại"))) {
          toast.error(t("sign_failed_retry"));
        } else if (
          errorMsg.includes("user rejected") ||
          errorMsg.includes("người dùng từ chối") ||
          errorMsg.includes("rejected")
        ) {
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
        toast.info(t("open_wallet_accept"));
        await connect({ connector: injectedConnector });
      } else if (walletConnectConnector) {
        toast.info(t("opening_walletconnect"));
        await connect({ connector: walletConnectConnector });
      } else {
        toast.error(t("no_wallet_found"));
      }
    } catch (error) {
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
      <Image src="/walletconnect.svg" width={16} height={16} className="mr-2 h-4 w-4" alt="WalletConnect" />
      {getButtonText()}
    </Button>
  );
}
