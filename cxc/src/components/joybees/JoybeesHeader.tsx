"use client";

interface JoybeesHeaderProps {
  variant: "public" | "vendor";
}

export default function JoybeesHeader({ variant }: JoybeesHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#FFE443] flex items-center justify-center text-lg">
              🐝
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-[0.12em] text-[#404041] leading-none">
                JOYBEES
              </h1>
              <p className="text-[9px] text-[#404041]/40 uppercase tracking-[0.25em] leading-none mt-0.5">
                Catalogo Panama
              </p>
            </div>
          </div>
        </div>
        {variant === "public" ? (
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-4 bg-[#FFE443] rounded-full" />
            <span className="text-[9px] font-medium uppercase tracking-wider text-[#404041]/30">
              Fashion Group
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
