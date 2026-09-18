-- Marker for which plan's included credits were granted in planPeriodYm.
-- Lets mid-cycle upgrades (Free → Starter) replace the Free included lot.

ALTER TABLE users ADD COLUMN planIncludedGrantPlanId TEXT;
