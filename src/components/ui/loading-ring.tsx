export function LoadingRing({ size }: { size: number }) {
  return <span className="ak-icon ak-spin loading-ring" style={{ width: size, height: size }} aria-hidden="true" />;
}
