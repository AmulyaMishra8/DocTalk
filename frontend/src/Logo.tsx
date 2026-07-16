import logoUrl from './assets/doctalk-logo.png';

// The DocTalk lockup. The artwork is a single square image that already
// contains the wordmark and the dot, so nothing should ever typeset "DocTalk"
// next to it — that would say the name twice.
//
// Every surface renders the brand through this component, so replacing the
// logo means swapping one file and nothing else.
export function Logo({ size = 52, className }: { size?: number; className?: string }) {
  return (
    <img
      className={className ? `dt-logo ${className}` : 'dt-logo'}
      src={logoUrl}
      alt="DocTalk"
      width={size}
      height={size}
    />
  );
}
