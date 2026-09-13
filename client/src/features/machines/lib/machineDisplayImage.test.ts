import { describe, expect, it } from 'vitest';
import { getMachineDisplayImageUrl } from './machineDisplayImage';

describe('getMachineDisplayImageUrl', () => {
  it('uses the API-resolved image/source pair when imageSource is present', () => {
    expect(getMachineDisplayImageUrl({ imageUrl: '/media/miners/x.webp', imageSource: 'catalog_current' })).toBe(
      '/media/miners/x.webp',
    );
  });

  it('falls back to the raw row imageUrl when no imageSource is given', () => {
    expect(getMachineDisplayImageUrl({ imageUrl: '/media/miners/legacy.webp' })).toBe('/media/miners/legacy.webp');
  });

  it('returns null when there is no usable image at all', () => {
    expect(getMachineDisplayImageUrl({})).toBeNull();
    expect(getMachineDisplayImageUrl({ imageUrl: null })).toBeNull();
  });

  it('an explicit "none" imageSource with no url returns null rather than falling through to the row field', () => {
    expect(getMachineDisplayImageUrl({ imageUrl: null, imageSource: 'none' })).toBeNull();
  });
});
