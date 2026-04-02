export enum PricingTier {
  Free = 'free',
  Pro = 'pro',
  Enterprise = 'enterprise',
}

export type PricingContext = {
  tier: PricingTier;
  executeMode: boolean;
};

/** Stub — returns free tier until billing is wired. */
export function getPricingContext(): PricingContext {
  return {
    tier: PricingTier.Free,
    executeMode: false,
  };
}
