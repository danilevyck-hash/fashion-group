"use client";

interface CatalogHeaderProps {
  variant: "public" | "vendor";
}

export default function CatalogHeader({ variant }: CatalogHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Reebok delta logo mark */}
          <div className="flex items-center gap-1">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <svg viewBox="0 0 32 32" className="w-7 h-7 text-[#E4002B]" fill="currentColor">
                  <path d="M4 24L16 4l12 20H4z" opacity="0.9" />
                </svg>
              </div>
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-[0.15em] text-[#1A2656] leading-none">
                REEBOK
              </h1>
              <p className="text-[9px] text-[#1A2656]/40 uppercase tracking-[0.25em] leading-none mt-0.5">
                Catalogo Panama
              </p>
            </div>
          </div>
        </div>
        {variant === "public" ? (
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-4 bg-[#E4002B] rounded-full" />
            <span className="text-[9px] font-medium uppercase tracking-wider text-[#1A2656]/30">
              Fashion Group
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
