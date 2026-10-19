// A book's cover, or a plain stand-in with its title when none was found.
export function BookCover({ src, title, className = "" }: { src: string | null; title: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className={`shrink-0 rounded bg-line object-cover shadow-sm ${className}`} />;
  }
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-accent-soft p-1.5 text-center shadow-sm ${className}`}
    >
      <span className="line-clamp-4 font-serif text-[0.65rem] leading-tight font-semibold text-accent">{title}</span>
    </div>
  );
}
