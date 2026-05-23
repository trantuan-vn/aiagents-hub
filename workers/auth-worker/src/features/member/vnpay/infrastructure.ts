import { UserDO } from '../../ws/infrastructure/UserDO';
import { 
  IVNPayService, 
  ICryptoService,
  CreatePayment,
  CassoQrRequest,
  PaymentQuery,
  CreateRefund,
  QueryDRResult,
  RefundResult,
  PaymentSchema,
  RefundSchema,
  VNPayReturn,
  PaymentResult
} from './domain';

import { config } from './config';
import { paymentUtils, cryptoUtils } from './utils';
import { VNPAY_CONSTANTS, PAYMENT_STATUS, ORDER_STATUS, PAYMENT_ERROR_MESSAGES } from './constant';

import { executeUtils } from '../../../shared/utils';
import { convertVndToUsd } from '../../admin/service/pricing';
import { getUsdVndRateFromEnv } from '../../admin/system-config/get-usd-vnd-rate';
import { getOrderPayableVnd } from '../order/domain';

export type VNPayWalletOptions = { env: Env; bindingName: string };

export function createVNPayService(
  userDO: DurableObjectStub<UserDO>,
  walletOptions?: VNPayWalletOptions,
): IVNPayService {
  const getRate = async (): Promise<number> => {
    if (!walletOptions) return 26000;
    return getUsdVndRateFromEnv(walletOptions.env, walletOptions.bindingName);
  };

  const walletCreditUsd = async (orderRow: { finalAmount?: number; currency?: string | null }): Promise<number> => {
    const raw = Number(orderRow.finalAmount ?? 0) || 0;
    if (raw <= 0) return 0;
    if ((orderRow.currency ?? 'VND').toUpperCase() === 'USD') return raw;
    const rate = await getRate();
    return convertVndToUsd(raw, rate);
  };

  const validatePayment = async (paymentId: number, expectedAmountVnd: number): Promise<number> => {
    const payments = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: "id", operator: '=', value: paymentId }
    }, 'payments');

    if (payments.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND);
    }
    
    if (payments[0].status !== PAYMENT_STATUS.PENDING) {
      throw new Error(PAYMENT_ERROR_MESSAGES.PAYMENT_ALREADY_PROCESSED);
    }

    const orders = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: "id", operator: '=', value: payments[0].orderId }
    }, 'orders');

    if (orders.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const order = orders[0];
    const rate = await getRate();
    const payableVnd = getOrderPayableVnd(order, rate);
    if (payableVnd !== Math.round(expectedAmountVnd)) {
      throw new Error(PAYMENT_ERROR_MESSAGES.INVALID_AMOUNT);
    }
    return order.id;
  };

  const processPaymentTransaction = async (
    paymentId: number, 
    orderId: number, 
    params: VNPayReturn
  ): Promise<void> => {
    const newPaymentStatus = (params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00')
      ? PAYMENT_STATUS.COMPLETED 
      : PAYMENT_STATUS.FAILED;
    
    let operations: any[] = [];
    
    // Update payment status
    operations.push({
      table: 'payments',
      operation: 'update',
      id: paymentId,
      data: { 
        
        status: newPaymentStatus, 
        queueStatus: 'pending' 
      }
    });
    
    if (newPaymentStatus === PAYMENT_STATUS.COMPLETED) {
      const orderRows = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'id', operator: '=', value: orderId },
      }, 'orders');
      const orderRow = orderRows[0];
      const userRows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
      const dbUser = userRows[0];
      if (!dbUser?.id || !orderRow) {
        throw new Error(PAYMENT_ERROR_MESSAGES.ORDER_NOT_FOUND);
      }
      const credit = await walletCreditUsd(orderRow);
      const prevBal = Number(dbUser.walletBalance ?? dbUser.wallet_balance ?? 0) || 0;

      operations.push({
        table: 'orders',
        operation: 'update',
        id: orderId,
        data: {
          status: ORDER_STATUS.COMPLETED,
          queueStatus: 'pending',
        },
      });

      operations.push({
        table: 'users',
        operation: 'update',
        id: dbUser.id,
        data: { walletBalance: prevBal + credit, queueStatus: 'pending' },
      });
      
      // Get all order_items for this order
      const orderItems = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: "orderId", operator: '=', value: orderId }
      }, 'order_items');
      
      // Update each order_item queueStatus
      for (const item of orderItems) {
        operations.push({
          table: 'order_items',
          operation: 'update',          
          id: item.id,
          data: { 
            
            queueStatus: 'pending' 
          }
        });
      }
      
      // Get all order_discounts for these order_items
      if (orderItems.length > 0) {
        // Query order_discounts for each order_item_id in parallel
        const orderDiscountsPromises = orderItems.map((item: { id: number }) =>
          executeUtils.executeDynamicAction(userDO, 'select', {
            where: { field: "orderItemId", operator: '=', value: item.id }
          }, 'order_discounts')
        );
        
        const orderDiscountsResults = await Promise.all(orderDiscountsPromises);
        
        // Flatten the results and update each order_discount queueStatus
        const allOrderDiscounts = orderDiscountsResults.flat();
        for (const discount of allOrderDiscounts) {
          operations.push({
            table: 'order_discounts',
            operation: 'update',            
            id: discount.id,
            data: { 
              
              queueStatus: 'pending' 
            }
          });
        }
      }
    } 

    await executeUtils.executeDynamicAction(userDO, 'multi-table', { operations });
  };

  const processRefundTransaction = async (
    orderId: number,
    request: CreateRefund,
    refundResult: any
  ): Promise<number> => {

    const refundData = RefundSchema.parse({
      ...request,
      status: refundResult.responseCode === '00' 
          ? PAYMENT_STATUS.COMPLETED 
          : PAYMENT_STATUS.FAILED,
      refundDetails: refundResult
    });
    
    let operations = [];
    operations.push({
      table: 'refunds',
      operation: 'insert',
      data: refundData
    });
    operations.push({
      table: 'payments',
      operation: 'update',
      id: request.paymentId, 
      data: { status: PAYMENT_STATUS.CANCELLED }
    });

    operations.push({
      table: 'orders',
      operation: 'update',
      id: orderId,
      data: { status: ORDER_STATUS.CANCELLED },
    });

    const orderRows = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'id', operator: '=', value: orderId } },
      'orders',
    );
    const orderRow = orderRows[0];
    const userRows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
    const dbUser = userRows[0];
    if (dbUser?.id && orderRow) {
      const bal = Number(dbUser.walletBalance ?? dbUser.wallet_balance ?? 0) || 0;
      const debit = Math.min(bal, await walletCreditUsd(orderRow));
      operations.push({
        table: 'users',
        operation: 'update',
        id: dbUser.id,
        data: { walletBalance: bal - debit, queueStatus: 'pending' },
      });
    }

    const results = await executeUtils.executeDynamicAction(userDO, 'multi-table', { operations: operations });
    
    return results[0].id;
  };

  const formatDateVNPay = (date: Date): string => {
    // Ép buộc tính theo giờ Việt Nam (UTC+7)
    const offset = 7 * 60; // +7 giờ tính bằng phút
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000); // chuyển về UTC
    const vnTime = new Date(utc + (offset * 60000));

    const year = vnTime.getFullYear();
    const month = String(vnTime.getMonth() + 1).padStart(2, '0');
    const day = String(vnTime.getDate()).padStart(2, '0');
    const hour = String(vnTime.getHours()).padStart(2, '0');
    const minute = String(vnTime.getMinutes()).padStart(2, '0');
    const second = String(vnTime.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hour}${minute}${second}`;
  };

  const createPaymentUrl = async (request: CreatePayment, ipAddr: string, identifier: string): Promise<string> => {
    
    paymentUtils.validateAmount(request.amount);

    const orders = await executeUtils.executeDynamicAction(userDO, 'select', { where: { field: 'id', operator: '=', value: request.orderId } }, 'orders');

    if (orders.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const order= orders[0];
    
    // Tạo payment trước để lấy paymentId
    const paymentData = PaymentSchema.parse({
      orderId: request.orderId,
      paymentMethod: request.bankCode === 'INTCARD' ? 'credit_card' : 'bank_transfer',
      gateway: 'vnpay',
      status: PAYMENT_STATUS.PENDING,
      paymentDetails: {}
    });
    
    const paymentRecord = await executeUtils.executeDynamicAction(userDO, 'insert', paymentData, 'payments');
    const paymentId = paymentRecord.id;
    
    // Tạo vnp_TxnRef với format đúng: identifier.paymentId.orderId
    const vnp_TxnRef = paymentUtils.createPaymentReference(identifier, paymentId, request.orderId);
    
    const date = new Date();
    
    const createDate = formatDateVNPay(date);
    const expireDate = formatDateVNPay(new Date(date.getTime() + VNPAY_CONSTANTS.TRANSACTION_TIMEOUT * 60 * 1000));
    
    const tmnCode = config.get('vnp_TmnCode');
    const secretKey = config.get('vnp_HashSecret');
    const vnpUrl = config.get('vnp_Url');
    const returnUrl = config.get('vnp_ReturnUrl');
    
    const vnp_Params: Record<string, any> = {
      'vnp_Version': VNPAY_CONSTANTS.VERSION,
      'vnp_Command': VNPAY_CONSTANTS.COMMAND_PAY,
      'vnp_TmnCode': tmnCode,
      'vnp_Locale': request.language,
      'vnp_CurrCode': VNPAY_CONSTANTS.CURRENCY,
      'vnp_TxnRef': vnp_TxnRef,
      'vnp_OrderInfo': `${request.language==='vn' ? 'Thanh toán đơn hàng:' : 'Payment order:'} ${order.notes ?? ''}`,
      'vnp_OrderType': VNPAY_CONSTANTS.ORDER_TYPE,
      'vnp_Amount': request.amount * 100,
      'vnp_ReturnUrl': returnUrl, 
      'vnp_IpAddr': ipAddr,
      'vnp_CreateDate': createDate,
      'vnp_ExpireDate': expireDate
    };

    if (request.bankCode) {
      vnp_Params['vnp_BankCode'] = request.bankCode;
    }

    let sortedParams = cryptoService.sortObject(vnp_Params);
    const querystring = require('qs');
    const signData = querystring.stringify(sortedParams, { encode: false });
    const signed = cryptoService.createSHA512Signature(signData, secretKey);
    
    sortedParams['vnp_SecureHash'] = signed;
    
    // Cập nhật payment với paymentDetails đầy đủ
    await executeUtils.executeDynamicAction(userDO, 'update', {
      id: paymentId,
      paymentDetails: sortedParams
    }, 'payments');

    const paymentUrl = vnpUrl + '?' + querystring.stringify(sortedParams, { encode: false });
    console.log(`${paymentUrl}`);
    return paymentUrl;
  };

  const processReturn = async (paymentId: number, params: VNPayReturn): Promise<PaymentResult> => {
    const orderId = await validatePayment(paymentId, parseInt(params.vnp_Amount) / 100);
    
    const isSuccess = (params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00');
        
    return {
      success: isSuccess,
      code: params.vnp_ResponseCode,
      message: paymentUtils.getResponseMessage(params.vnp_ResponseCode),  
      orderId: orderId,
      amount: parseInt(params.vnp_Amount) / 100,
      transactionNo: params.vnp_TransactionNo,
      bankCode: params.vnp_BankCode
    };
  };

  const processIPN = async (paymentId: number, params: VNPayReturn): Promise<PaymentResult> => {
    const payments = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: "id", operator: '=', value: paymentId }
    }, 'payments');

    if (payments.length === 0) {
      return {
        success: false,
        code: '01',
        message: PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND,  
      };
    }

    const payment = payments[0];
    
    if (payment.status !== PAYMENT_STATUS.PENDING) {
      return {
        success: false,
        code: '02',
        message: PAYMENT_ERROR_MESSAGES.PAYMENT_ALREADY_PROCESSED,  
      };
    }

    const expectedAmount = payment.paymentDetails.vnp_Amount / 100;

    const orders = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: "id", operator: '=', value: payment.orderId }
    }, 'orders');

    if (orders.length === 0) {
      return {
        success: false,
        code: '01',
        message: PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND,  
      };
    }

    const order = orders[0];
    const rate = await getRate();
    const payableVnd = getOrderPayableVnd(order, rate);
    if (payableVnd !== Math.round(expectedAmount)) {
      return {
        success: false,
        code: '04',
        message: PAYMENT_ERROR_MESSAGES.INVALID_AMOUNT,  
      };
    }
    
    await processPaymentTransaction(paymentId, order.id, params);

    return {
      success: true,
      code: '00',
      message: 'Success',  
    };
  };

  const randomCassoTransferCode = (): string => {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return `C${Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  };

  const createCassoQr = async (
    request: CassoQrRequest,
    identifier: string,
    kv: KVNamespace,
    vietqr: { accountNo: string; accountName: string; acqId: string },
  ): Promise<{ qr: string }> => {
    paymentUtils.validateAmount(request.amount);

    const orders = await executeUtils.executeDynamicAction(
      userDO,
      "select",
      { where: { field: "id", operator: "=", value: request.orderId } },
      "orders",
    );

    if (orders.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const transferCode = randomCassoTransferCode();
    const paymentData = PaymentSchema.parse({
      orderId: request.orderId,
      paymentMethod: "bank_transfer",
      gateway: "casso",
      status: PAYMENT_STATUS.PENDING,
      paymentDetails: {},
    });

    const paymentRecord = await executeUtils.executeDynamicAction(userDO, "insert", paymentData, "payments");
    const paymentId = paymentRecord.id as number;

    await kv.put(`casso_ref:${transferCode}`, JSON.stringify({ identifier, paymentId }), {
      expirationTtl: 60 * 60 * 24 * 7,
    });

    const vietQrBody = {
      accountNo: vietqr.accountNo,
      accountName: vietqr.accountName,
      acqId: vietqr.acqId,
      amount: request.amount,
      addInfo: transferCode,
      format: "text",
      template: "compact",
    };

    let qrPayload: string | undefined;
    try {
      const res = await fetch("https://api.vietqr.io/v2/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vietQrBody),
      });
      if (!res.ok) {
        throw new Error(`VietQR HTTP ${res.status}`);
      }
      const jr = (await res.json()) as { data?: { qrDataURL?: string } };
      qrPayload = jr.data?.qrDataURL;
    } catch {
      await kv.delete(`casso_ref:${transferCode}`);
      throw new Error(PAYMENT_ERROR_MESSAGES.VIETQR_FAILED);
    }

    if (!qrPayload) {
      await kv.delete(`casso_ref:${transferCode}`);
      throw new Error(PAYMENT_ERROR_MESSAGES.VIETQR_FAILED);
    }

    await executeUtils.executeDynamicAction(
      userDO,
      "update",
      {
        id: paymentId,
        paymentDetails: {
          vnp_Amount: request.amount * 100,
          casso_transferCode: transferCode,
          vietqr_addInfo: transferCode,
        },
      },
      "payments",
    );

    return { qr: qrPayload };
  };

  const processCassoIPN = async (
    paymentId: number,
    creditedAmount: number,
    externalRef: string,
  ): Promise<PaymentResult> => {
    const payments = await executeUtils.executeDynamicAction(
      userDO,
      "select",
      {
        where: { field: "id", operator: "=", value: paymentId },
      },
      "payments",
    );

    if (payments.length === 0) {
      return {
        success: false,
        code: "01",
        message: PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND,
      };
    }

    const payment = payments[0] as { status: string; orderId: number; gateway?: string; paymentDetails?: { vnp_Amount?: number } };

    if (payment.gateway !== "casso") {
      return {
        success: false,
        code: "01",
        message: PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND,
      };
    }

    if (payment.status !== PAYMENT_STATUS.PENDING) {
      return {
        success: false,
        code: "02",
        message: PAYMENT_ERROR_MESSAGES.PAYMENT_ALREADY_PROCESSED,
      };
    }

    const expectedAmount = (payment.paymentDetails?.vnp_Amount ?? 0) / 100;

    const orders = await executeUtils.executeDynamicAction(userDO, "select", {
      where: { field: "id", operator: "=", value: payment.orderId },
    }, "orders");

    if (orders.length === 0) {
      return {
        success: false,
        code: "01",
        message: PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND,
      };
    }

    const order = orders[0] as { id: number; finalAmount: number; payableAmountVnd?: number; currency?: string };
    const rate = await getRate();
    const payableVnd = getOrderPayableVnd(order, rate);
    if (payableVnd !== Math.round(expectedAmount) || Math.round(creditedAmount) !== payableVnd) {
      return {
        success: false,
        code: "04",
        message: PAYMENT_ERROR_MESSAGES.INVALID_AMOUNT,
      };
    }

    const synthetic: VNPayReturn = {
      vnp_TmnCode: "CASSO",
      vnp_Amount: String(creditedAmount * 100),
      vnp_BankCode: "CASSO",
      vnp_BankTranNo: externalRef,
      vnp_CardType: undefined,
      vnp_PayDate: formatDateVNPay(new Date()),
      vnp_OrderInfo: "Casso bank transfer",
      vnp_TransactionNo: externalRef,
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
      vnp_TxnRef: `${paymentId}`,
      vnp_SecureHash: "",
    };

    await processPaymentTransaction(paymentId, order.id, synthetic);

    return {
      success: true,
      code: "00",
      message: "Success",
    };
  };

  const queryTransaction = async (request: PaymentQuery, ipAddr: string): Promise<QueryDRResult> => {
    // Lấy payment trước để lấy orderId
    const payments = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: "id", operator: '=', value: request.paymentId }
    }, 'payments');

    if (payments.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND);
    }

    const payment = payments[0];
    
    // Lấy order từ orderId
    const orders = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: "id", operator: '=', value: payment.orderId }
    }, 'orders');

    if (orders.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND);
    }

    const order = orders[0];
    const date = new Date();
    const vnp_TmnCode = config.get('vnp_TmnCode');
    const secretKey = config.get('vnp_HashSecret');
    const vnp_Api = config.get('vnp_Api');

    
    const vnp_CreateDate = formatDateVNPay(date);
    const vnp_RequestId = vnp_CreateDate.substring(vnp_CreateDate.length - 6);

    const data = `${vnp_RequestId}|${VNPAY_CONSTANTS.VERSION}|${VNPAY_CONSTANTS.COMMAND_QUERY}|${vnp_TmnCode}|${order.orderCode}|${request.transDate}|${vnp_CreateDate}|${ipAddr}|Truy van GD ma: ${order.orderCode}`;
    
    const vnp_SecureHash = cryptoService.createSHA512Signature(data, secretKey);
    
    const dataObj = {
      'vnp_RequestId': vnp_RequestId,
      'vnp_Version': VNPAY_CONSTANTS.VERSION,
      'vnp_Command': VNPAY_CONSTANTS.COMMAND_QUERY,
      'vnp_TmnCode': vnp_TmnCode,
      'vnp_TxnRef': order.orderCode,
      'vnp_OrderInfo': `Truy van GD ma: ${order.orderCode}`,
      'vnp_TransactionDate': request.transDate,
      'vnp_CreateDate': vnp_CreateDate,
      'vnp_IpAddr': ipAddr,
      'vnp_SecureHash': vnp_SecureHash
    };

    const response = await fetch(vnp_Api, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataObj)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const body = await response.json() as any;
    if (cryptoService.validateSignature(body, secretKey, body.vnp_SecureHash)) {
      throw new Error(PAYMENT_ERROR_MESSAGES.CHECKSUM_FAILED);
    }
    return {
      responseCode: body.vnp_ResponseCode,
      message: body.vnp_Message,
      transaction: body
    };
  };

  const refundTransaction = async (identifier: string, request: CreateRefund, ipAddr: string): Promise<RefundResult> => {
    const date = new Date();
    const vnp_TmnCode = config.get('vnp_TmnCode');
    const secretKey = config.get('vnp_HashSecret');
    const vnp_Api = config.get('vnp_Api');

    const vnp_CreateDate = formatDateVNPay(date);
    const vnp_RequestId = vnp_CreateDate.substring(vnp_CreateDate.length - 6);

    
    const payments = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: [
        { field: "id", operator: '=', value: request.paymentId },
        { field: "status", operator: '=', value: PAYMENT_STATUS.COMPLETED }
      ]
    }, 'payments');

    if (payments.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.PAYMENT_NOT_FOUND);
    }

    const payment = payments[0];
    const vnp_TransactionNo = payment.paymentDetails.vnp_TransactionNo || '';

    const orders = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: [
        { field: "id", operator: '=', value: payment.orderId },
        { field: "status", operator: '=', value: ORDER_STATUS.COMPLETED }
      ]
    }, 'orders');

    if (orders.length === 0) {
      throw new Error(PAYMENT_ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const order = orders[0];
    const rate = await getRate();
    const refundVnd = getOrderPayableVnd(order, rate);

    const data = `${vnp_RequestId}|${VNPAY_CONSTANTS.VERSION}|${VNPAY_CONSTANTS.COMMAND_REFUND}|${vnp_TmnCode}|${request.transactionType}|${order.orderCode}|${refundVnd}|${refundVnd * 100}|${vnp_TransactionNo}|${vnp_CreateDate}|${identifier}|${vnp_CreateDate}|${ipAddr}|Hoan tien GD ma: ${order.orderCode} voi ly do: ${request.reason}`;
    
    const vnp_SecureHash = cryptoService.createSHA512Signature(data, secretKey);

    const dataObj = {
      'vnp_RequestId': vnp_RequestId,
      'vnp_Version': VNPAY_CONSTANTS.VERSION,
      'vnp_Command': VNPAY_CONSTANTS.COMMAND_REFUND,
      'vnp_TmnCode': vnp_TmnCode,
      'vnp_TransactionType': request.transactionType,
      'vnp_TxnRef': order.orderCode,
      'vnp_Amount': refundVnd * 100,
      'vnp_OrderInfo': `Hoan tien GD ma: ${order.orderCode} voi ly do: ${request.reason}`,
      'vnp_TransactionNo': vnp_TransactionNo,
      'vnp_TransactionDate': vnp_CreateDate,      
      'vnp_CreateBy': identifier,
      'vnp_CreateDate': vnp_CreateDate,
      'vnp_IpAddr': ipAddr,      
      'vnp_SecureHash': vnp_SecureHash
    };

    const response = await fetch(vnp_Api, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataObj)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const body = await response.json() as any;

    if (cryptoService.validateSignature(body, secretKey, body.vnp_SecureHash)) {
      throw new Error(PAYMENT_ERROR_MESSAGES.CHECKSUM_FAILED);
    }
    
    if (body.vnp_ResponseCode !== '00') {
      throw new Error(body.message);
    }

    const refundId = await processRefundTransaction(order.id, request, body);

    return {
      responseCode: body.vnp_ResponseCode,
      message: body.vnp_Message,
      refundId
    };
  };

  return {
    createPaymentUrl,
    processReturn,
    processIPN,
    createCassoQr,
    processCassoIPN,
    queryTransaction,
    refundTransaction
  };
}

export function createCryptoService(): ICryptoService {
  return {
    createSHA512Signature(data: string, secretKey: string): string {
      return cryptoUtils.createSHA512Signature(data, secretKey);
    },

    validateSignature(params: Record<string, any>, secretKey: string, secureHash: string): boolean {
      return cryptoUtils.validateSignature(params, secretKey, secureHash);
    },

    sortObject(obj: Record<string, any>): Record<string, any> {
      return paymentUtils.sortObject(obj);
    }
  };
}

// Create crypto service instance
const cryptoService = createCryptoService();