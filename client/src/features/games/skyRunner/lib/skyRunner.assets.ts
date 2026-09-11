import skylineUrl from '../assets/skyline.svg';
import droneUrl from '../assets/drone.svg';
import pillarBodyUrl from '../assets/pillar-body.svg';

export type SkyRunnerAssets = {
  moon: HTMLImageElement | null;
  skyline: HTMLImageElement | null;
  cloudA: HTMLImageElement | null;
  cloudB: HTMLImageElement | null;
  pillarBody: HTMLImageElement | null;
  pillarCap: HTMLImageElement | null;
  drone: HTMLImageElement | null;
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Simple inline SVG data-URLs for pieces we don't ship as files yet. */
function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MOON_SVG = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#fde68a"/><circle cx="42" cy="24" r="22" fill="#071334" opacity="0.35"/><circle cx="22" cy="28" r="4" fill="#f59e0b" opacity="0.35"/><circle cx="36" cy="40" r="3" fill="#f59e0b" opacity="0.28"/></svg>`,
);

const CLOUD_A_SVG = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 64"><g fill="#e2e8f0" opacity="0.85"><ellipse cx="48" cy="36" rx="36" ry="20"/><ellipse cx="78" cy="28" rx="30" ry="22"/><ellipse cx="110" cy="38" rx="34" ry="18"/></g></svg>`,
);

const CLOUD_B_SVG = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 56"><g fill="#cbd5e1" opacity="0.75"><ellipse cx="40" cy="32" rx="30" ry="16"/><ellipse cx="70" cy="24" rx="28" ry="18"/><ellipse cx="100" cy="34" rx="26" ry="14"/></g></svg>`,
);

const PILLAR_CAP_SVG = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 24"><rect x="2" y="4" width="60" height="16" rx="4" fill="#0ea5e9"/><rect x="0" y="0" width="64" height="8" rx="3" fill="#38bdf8"/></svg>`,
);

export async function loadSkyRunnerAssets(): Promise<SkyRunnerAssets> {
  const [skyline, drone, pillarBody, moon, cloudA, cloudB, pillarCap] = await Promise.all([
    loadImage(skylineUrl),
    loadImage(droneUrl),
    loadImage(pillarBodyUrl),
    loadImage(MOON_SVG),
    loadImage(CLOUD_A_SVG),
    loadImage(CLOUD_B_SVG),
    loadImage(PILLAR_CAP_SVG),
  ]);

  return {
    skyline,
    drone,
    pillarBody,
    pillarCap,
    moon,
    cloudA,
    cloudB,
  };
}

export function imageIsDrawable(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}
