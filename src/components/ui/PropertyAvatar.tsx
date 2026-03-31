"use client";

interface PropertyAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: number; // px, default 32
  className?: string;
}

export default function PropertyAvatar({ name, photoUrl, size = 32, className = "" }: PropertyAvatarProps) {
  if (photoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={photoUrl}
        alt={name}
        className={`rounded-lg object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Fallback: colored circle with first letter
  const colors = [
    "bg-brand-100 text-brand-700",
    "bg-blue-100 text-blue-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-violet-100 text-violet-700",
    "bg-cyan-100 text-cyan-700",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % colors.length;

  return (
    <div
      className={`rounded-lg flex items-center justify-center font-bold flex-shrink-0 ${colors[h]} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
