import { MiningRackShelf } from './MiningRackShelf';

/**
 * MiningRackShelf already draws `/media/racks/default-shelf.svg`.
 * The common rack catalog always sends that URL, so treating every imageUrl as an
 * <img> would replace the component the shop shows today. A different URL, such as
 * the 3D rack, is the catalog art.
 */
export const DEFAULT_RACK_SHELF_IMAGE_URL = '/media/racks/default-shelf.svg';

export function rackCatalogImageSrc(imageUrl: string | null | undefined): string | null {
  const src = imageUrl?.trim() ?? '';
  if (!src || src === DEFAULT_RACK_SHELF_IMAGE_URL) return null;
  return src;
}

export function RackCatalogArt({
  imageUrl,
  className = 'h-auto w-full max-w-md',
}: {
  imageUrl?: string | null;
  className?: string;
}) {
  const src = rackCatalogImageSrc(imageUrl);
  if (!src) return <MiningRackShelf className={className} />;
  return <img src={src} alt="" className={`${className} object-contain`} />;
}
