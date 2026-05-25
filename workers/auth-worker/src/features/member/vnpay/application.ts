import { Context } from 'hono';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createVNPayService, createCryptoService } from './infrastructure';
import { paymentUtils } from './utils';

import { 
  CreatePaymentSchema,
  CassoQrSchema,
  PaymentQuerySchema,
  RefundSchema,
  VNPayReturnSchema,
  CreatePayment,
  CassoQrRequest,
  PaymentQuery,
  RefundRequest,
  PaymentResult,
  QueryDRResult,
  RefundResult
} from './domain';
import { config } from './config';
import { getCassoWebhookChecksumKey, getVietQrConfig } from './casso-config';
import { verifyCassoWebhookSignature, extractCassoTransfer } from './casso-signature';
import { processEarningsPayoutCassoIPN } from '../../admin/earnings-payout/service';
import { PAYMENT_ERROR_MESSAGES } from './constant';
import { appendCassoIpnLog } from './casso-ipn-log';

interface IPaymentApplicationService {
  createPaymentUrlUseCase(identifier: string, request: CreatePayment, ipAddr: string): Promise<string>;
  processReturnUseCase(params: any): Promise<PaymentResult>;
  processIPNUseCase(params: any): Promise<PaymentResult>;
  processCassoIPNUseCase(body: unknown, headers: Headers, kv: KVNamespace): Promise<PaymentResult>;
  createCassoQrUseCase(identifier: string, request: CassoQrRequest, kv: KVNamespace): Promise<{ qr: string }>;
  queryTransactionUseCase(identifier: string, request: PaymentQuery, ipAddr: string): Promise<QueryDRResult>;
  refundTransactionUseCase(identifier: string, request: RefundRequest, ipAddr: string): Promise<RefundResult>;
}

export function createPaymentApplicationService(c: Context, bindingName: string): IPaymentApplicationService {
  const cryptoService = createCryptoService();

  const validate = (params: any) => {
    const secretKey = config.get('vnp_HashSecret');
    const secureHash = params.vnp_SecureHash;

    const paramsWithoutHash = { ...params } as any;
    delete paramsWithoutHash.vnp_SecureHash;
    delete paramsWithoutHash.vnp_SecureHashType;

    const isValid = cryptoService.validateSignature(paramsWithoutHash, secretKey, secureHash);      
    return isValid;

  };

  return {
    async createPaymentUrlUseCase(identifier: string, request: CreatePayment, ipAddr: string): Promise<string> {
      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const vnpayService = createVNPayService(userDO, { env: c.env, bindingName });
      
      const validatedRequest = CreatePaymentSchema.parse(request);
      return await vnpayService.createPaymentUrl(validatedRequest, ipAddr, identifier);
    },

    async processReturnUseCase(params: any): Promise<PaymentResult> {
      console.log(`processReturnUseCase: ${JSON.stringify(params)}`);
      const { identifier, paymentId, orderId } = paymentUtils.parsePaymentReference(params.vnp_TxnRef);
      const isValid = validate(params);
      if (!isValid) {
        return {
          success: false,
          code: '97',
          message: PAYMENT_ERROR_MESSAGES.CHECKSUM_FAILED,  
          orderId: orderId,
          amount: parseInt(params.vnp_Amount) / 100,
          transactionNo: params.vnp_TransactionNo,
          bankCode: params.vnp_BankCode
        };
      }
      const validatedParams = VNPayReturnSchema.parse(params);      
      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const vnpayService = createVNPayService(userDO, { env: c.env, bindingName });
      
      return await vnpayService.processReturn(paymentId, validatedParams);
    },

    async processIPNUseCase(params: any): Promise<PaymentResult> {
      console.log(`processReturnUseCase: ${JSON.stringify(params)}`);
      const { identifier, paymentId } = paymentUtils.parsePaymentReference(params.vnp_TxnRef);
      const isValid = validate(params);
      if (!isValid) {
        return {
          success: false,
          code: '97',
          message: PAYMENT_ERROR_MESSAGES.CHECKSUM_FAILED,  
        };
      }
      const validatedParams = VNPayReturnSchema.parse(params); 

      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const vnpayService = createVNPayService(userDO, { env: c.env, bindingName });
      
      return await vnpayService.processIPN(paymentId, validatedParams);
    },

    async processCassoIPNUseCase(body: unknown, headers: Headers, kv: KVNamespace): Promise<PaymentResult> {
      const payload = body as Record<string, unknown>;
      const checksumKey = await getCassoWebhookChecksumKey(c.env);
      const headerSig = headers.get("X-Casso-Signature") ?? headers.get("x-casso-signature") ?? undefined;
      if (!verifyCassoWebhookSignature(headerSig, payload, checksumKey)) {
        console.error('[CassoIPN] checksum failed', { hasSig: Boolean(headerSig) });
        return {
          success: false,
          code: "97",
          message: PAYMENT_ERROR_MESSAGES.CHECKSUM_FAILED,
        };
      }

      const err = payload.error;
      if (typeof err === "number" && err !== 0) {
        const errMessage = `${PAYMENT_ERROR_MESSAGES.CASSO_WEBHOOK_ERROR} (code=${err})`;
        console.error('[CassoIPN] Casso payload error', { err, payload });
        return {
          success: false,
          code: "06",
          message: errMessage,
        };
      }

      const data = payload.data as Record<string, unknown> | undefined;
      const description = typeof data?.description === "string" ? data.description : "";
      const amount = data?.amount;
      const reference = typeof data?.reference === "string" ? data.reference : "casso";

      if (typeof amount !== "number") {
        console.error('[CassoIPN] missing amount', { description, reference });
        return {
          success: false,
          code: "01",
          message: PAYMENT_ERROR_MESSAGES.INVALID_CASSO_PAYLOAD,
        };
      }

      const transfer = extractCassoTransfer(description);
      if (!transfer) {
        console.error('[CassoIPN] transfer code not found in description', { description, amount, reference });
        return {
          success: false,
          code: "01",
          message: PAYMENT_ERROR_MESSAGES.INVALID_CASSO_PAYLOAD,
        };
      }

      if (transfer.kind === 'payout' || amount < 0) {
        return await processEarningsPayoutCassoIPN(
          c,
          bindingName,
          transfer.code,
          amount,
          reference,
          kv,
        );
      }

      const mapping = await kv.get(`casso_ref:${transfer.code}`);
      if (!mapping) {
        console.error('[CassoIPN] KV mapping missing', { transferCode: transfer.code, amount, reference });
        return {
          success: false,
          code: "01",
          message: PAYMENT_ERROR_MESSAGES.CASSO_TRANSFER_NOT_FOUND,
        };
      }

      let identifier: string;
      let paymentId: number;
      try {
        const parsed = JSON.parse(mapping) as { identifier: string; paymentId: number };
        identifier = parsed.identifier;
        paymentId = parsed.paymentId;
      } catch {
        console.error('[CassoIPN] invalid KV mapping', { transferCode: transfer.code, mapping });
        return {
          success: false,
          code: "01",
          message: PAYMENT_ERROR_MESSAGES.INVALID_CASSO_PAYLOAD,
        };
      }

      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const vnpayService = createVNPayService(userDO, { env: c.env, bindingName });

      try {
        const result = await vnpayService.processCassoIPN(paymentId, amount, reference, transfer.code);
        if (result.success) {
          await kv.delete(`casso_ref:${transfer.code}`);
        }
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : PAYMENT_ERROR_MESSAGES.INVALID_REQUEST;
        await appendCassoIpnLog(userDO, paymentId, {
          success: false,
          code: "99",
          message,
          phase: "webhook",
          creditedAmount: amount,
          externalRef: reference,
          transferCode: transfer.code,
        });
        throw e;
      }
    },

    async createCassoQrUseCase(identifier: string, request: CassoQrRequest, kv: KVNamespace): Promise<{ qr: string }> {
      const validatedRequest = CassoQrSchema.parse(request);
      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const vnpayService = createVNPayService(userDO, { env: c.env, bindingName });
      return await vnpayService.createCassoQr(validatedRequest, identifier, kv, await getVietQrConfig(c.env));
    },

    async queryTransactionUseCase(identifier: string, request: PaymentQuery, ipAddr: string): Promise<QueryDRResult> {
      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const vnpayService = createVNPayService(userDO, { env: c.env, bindingName });
      
      const validatedRequest = PaymentQuerySchema.parse(request);
      return await vnpayService.queryTransaction(validatedRequest, ipAddr);
    },

    async refundTransactionUseCase(identifier: string, request: RefundRequest, ipAddr: string): Promise<RefundResult> {
      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const vnpayService = createVNPayService(userDO, { env: c.env, bindingName });
      
      const validatedRequest = RefundSchema.parse(request);
      return await vnpayService.refundTransaction(identifier, validatedRequest, ipAddr);
    }
  };
}