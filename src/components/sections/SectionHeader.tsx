interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <div className="max-w-3xl">
      {eyebrow && (
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 text-3xl font-black tracking-normal text-[#0A0A0A] sm:text-4xl lg:text-[2.6rem] lg:leading-[1.05]">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-7 text-[#727986] sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
