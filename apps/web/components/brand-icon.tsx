export const BRAND_ICON_URL = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/favicon.svg?v=2`;

export function BrandIcon({ size = 36 }: { size?: number }) {
  return <img src={BRAND_ICON_URL} alt="NexusFlow" width={size} height={size} style={{ display: "block", flexShrink: 0, objectFit: "contain" }} />;
}
