import { describe, expect, it } from 'vitest';
import {
  OFFER_MODEL_FEATURE_FOV,
  OFFER_MODEL_FEATURE_ORBIT,
  OFFER_MODEL_THUMB_FOV,
  OFFER_MODEL_THUMB_ORBIT,
  RACK_MODEL_FOV,
  RACK_MODEL_ORBIT,
} from './OfferMinerModel';

describe('offer and rack cameras stay separate', () => {
  it('keeps the approved offer stage orbits', () => {
    expect(OFFER_MODEL_FEATURE_ORBIT).toBe('16deg 72deg 68%');
    expect(OFFER_MODEL_FEATURE_FOV).toBe('16deg');
    expect(OFFER_MODEL_THUMB_ORBIT).toBe('18deg 74deg 88%');
    expect(OFFER_MODEL_THUMB_FOV).toBe('20deg');
  });

  it('frames the rack orbit on the yaw of this bay, not on the offer stage', () => {
    expect(RACK_MODEL_ORBIT).toBe('12deg 90deg 54.5%');
    expect(RACK_MODEL_FOV).toBe('16deg');
    expect(RACK_MODEL_ORBIT).not.toBe(OFFER_MODEL_FEATURE_ORBIT);
    expect(RACK_MODEL_ORBIT).not.toBe(OFFER_MODEL_THUMB_ORBIT);
  });
});
