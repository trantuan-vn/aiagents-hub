import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  PricePolicy,
  PriceCalculationRequest,
  IPriceInfrastructureService,
} from './domain';
import { executeUtils } from '../../../shared/utils';

export function createPriceInfrastructureService(userDO: DurableObjectStub<UserDO>): IPriceInfrastructureService {
  const isPolicyApplicable = (policy: any, request: PriceCalculationRequest): boolean => {
    const conditions = policy.conditions || {};

    if (policy.status !== 'ACTIVE') {
      return false;
    }

    if (policy.expiresAt && new Date(policy.expiresAt) < new Date()) {
      return false;
    }

    if (policy.applicableTo === 'SPECIFIC') {
      const ids: number[] = policy.targetIds || [];
      if (ids.length === 0 || !ids.includes(request.userId)) {
        return false;
      }
    }

    if (conditions.userRoles?.length && request.userRole && !conditions.userRoles.includes(request.userRole)) {
      return false;
    }

    if (policy.type === 'USAGE_BASED' && conditions.maxCalls != null) {
      if ((request.currentCalls ?? 0) >= conditions.maxCalls) {
        return false;
      }
    }

    if (conditions.minQuantity && request.quantity) {
      if (request.quantity < conditions.minQuantity) {
        return false;
      }
    }

    return true;
  };

  const calculateDiscount = (policy: any, currentPrice: number, request: PriceCalculationRequest): number => {
    switch (policy.type) {
      case 'PERCENTAGE':
        return currentPrice * (policy.value / 100);
      case 'FIXED_AMOUNT':
        return policy.value;
      case 'TIERED':
        return calculateTieredDiscount(policy, currentPrice, request);
      case 'USAGE_BASED':
        return calculateUsageBasedDiscount(policy, request);
      default:
        return 0;
    }
  };

  const calculateTieredDiscount = (policy: any, currentPrice: number, request: PriceCalculationRequest): number => {
    const tiers = [...(policy.conditions?.tiers || [])].sort(
      (a, b) => (a.minAmount || a.minUsage || 0) - (b.minAmount || b.minUsage || 0),
    );

    let applicableTier: (typeof tiers)[0] | null = null;
    for (const tier of tiers) {
      if (tier.minAmount && currentPrice >= tier.minAmount) {
        applicableTier = tier;
      } else if (tier.minUsage != null && (request.currentCalls ?? 0) >= tier.minUsage) {
        applicableTier = tier;
      }
    }

    if (!applicableTier) return 0;

    return applicableTier.type === 'PERCENTAGE'
      ? currentPrice * (applicableTier.value / 100)
      : applicableTier.value;
  };

  const calculateUsageBasedDiscount = (policy: any, request: PriceCalculationRequest): number => {
    const conditions = policy.conditions || {};
    const currentCalls = request.currentCalls || 0;
    const maxCalls = conditions.maxCalls || 1;

    if (conditions.usagePercentage != null && maxCalls > 0) {
      const pctUsed = (currentCalls / maxCalls) * 100;
      if (pctUsed >= conditions.usagePercentage) {
        return policy.value;
      }
    }

    return 0;
  };

  const calculatePrice = async (request: PriceCalculationRequest) => {
    const allPolicies = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      {
        orderBy: { field: 'priority', direction: 'DESC' },
      },
      'price_policies',
    );

    const now = new Date();
    const activePolicies = allPolicies.filter((policy: any) => {
      if (policy.status !== 'ACTIVE') return false;
      if (policy.expiresAt && new Date(policy.expiresAt) < now) return false;
      return true;
    });

    let finalPrice = request.basePrice;
    let totalDiscount = 0;
    const appliedPolicies: Array<{ policyId: number; policyName: string; discount: number; type: string }> = [];

    for (const policy of activePolicies) {
      if (isPolicyApplicable(policy, request)) {
        const discount = calculateDiscount(policy, finalPrice, request);
        finalPrice = Math.max(0, finalPrice - discount);
        totalDiscount += discount;

        appliedPolicies.push({
          policyId: policy.id,
          policyName: policy.name,
          discount,
          type: policy.type,
        });
      }
    }

    return {
      basePrice: request.basePrice,
      finalPrice,
      totalDiscount,
      appliedPolicies,
      currency: request.currency || 'VND',
      userId: request.userId,
    };
  };

  return {
    createPricePolicy: (request: Partial<PricePolicy>) =>
      executeUtils.executeDynamicAction(userDO, 'insert', request, 'price_policies'),

    updatePricePolicy: (policyId: number, request: Partial<PricePolicy>) =>
      executeUtils.executeDynamicAction(userDO, 'update', { id: policyId, ...request }, 'price_policies'),

    getPricePolicies: (limit: number, offset: number, status?: string) =>
      executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          ...(status ? { where: { field: 'status', operator: '=', value: status } } : {}),
          orderBy: { field: 'priority', direction: 'DESC' },
          limit,
          offset,
        },
        'price_policies',
      ),

    getPricePolicy: (policyId: number) =>
      executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: { field: 'id', operator: '=', value: policyId },
        },
        'price_policies',
      ),

    deletePricePolicy: (policyId: number) =>
      executeUtils.executeDynamicAction(userDO, 'delete', { id: policyId }, 'price_policies'),

    updatePolicyStatus: (policyId: number, status: string) =>
      executeUtils.executeDynamicAction(userDO, 'update', { id: policyId, status: status }, 'price_policies'),

    calculatePrice: (request: PriceCalculationRequest) => calculatePrice(request),
  };
}
