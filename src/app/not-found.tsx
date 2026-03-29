import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="text-center max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-3 h-3 rounded-full bg-brand-500" />
          <span className="text-xl font-bold text-neutral-800 tracking-tight">
            StayCommand
          </span>
        </div>

        <p className="text-6xl font-bold text-neutral-200 mb-4">404</p>
        <h1 className="text-xl font-bold text-neutral-800 mb-2">
          Page not found
        </h1>
        <p className="text-neutral-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
