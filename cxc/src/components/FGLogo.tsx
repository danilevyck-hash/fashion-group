"use client";

interface FGLogoProps {
  variant?: "icon" | "horizontal" | "full";
  theme?: "light" | "dark";
  size?: number;
}

export default function FGLogo({ variant = "horizontal", theme = "light", size = 40 }: FGLogoProps) {
  const black = theme === "light" ? "#0a0a0a" : "#ffffff";
  const blackFaded = theme === "light" ? "rgba(10,10,10,0.75)" : "rgba(255,255,255,0.4)";
  const groupColor = theme === "light" ? "#444444" : "rgba(255,255,255,0.62)";
  const divColor = theme === "light" ? "#d0d0cc" : "rgba(255,255,255,0.15)";

  const Icon = ({ s }: { s: number }) => (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
      <rect x="1" y="1" width="98" height="98" stroke={blackFaded} strokeWidth="0.8" fill="none"/>
      <text
        x="50" y="67"
        fontFamily="Cormorant Garamond, Georgia, Times New Roman, serif"
        fontSize="52"
        fontWeight="300"
        fill={black}
        textAnchor="middle"
        letterSpacing="-1"
      >FG</text>
    </svg>
  );

  if (variant === "icon") return <Icon s={size} />;

  if (variant === "horizontal") {
    const iconSize = size;
    const wordmarkW = Math.round(iconSize * 3.4);
    const wordmarkH = iconSize;
    const f1 = Math.round(iconSize * 0.326);
    const f2 = Math.round(iconSize * 0.228);
    const y1 = Math.round(iconSize * 0.478);
    const y2 = Math.round(iconSize * 0.891);
    const ls1 = (iconSize * 0.12).toFixed(1);
    const ls2 = (iconSize * 0.174).toFixed(1);

    return (
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(iconSize * 0.478) }}>
        <Icon s={iconSize} />
        <svg width="1" height={iconSize} viewBox={`0 0 1 ${iconSize}`}>
          <line x1="0.5" y1="0" x2="0.5" y2={iconSize} stroke={divColor} strokeWidth="0.5"/>
        </svg>
        <svg width={wordmarkW} height={wordmarkH} viewBox={`0 0 ${wordmarkW} ${wordmarkH}`} fill="none">
          <text x="0" y={y1}
            fontFamily="Montserrat, sans-serif"
            fontSize={f1} fontWeight="200"
            fill={black} letterSpacing={ls1}>FASHION</text>
          <text x="0.5" y={y2}
            fontFamily="Montserrat, sans-serif"
            fontSize={f2} fontWeight="300"
            fill={groupColor} letterSpacing={ls2}>GROUP</text>
        </svg>
      </div>
    );
  }

  // full / stacked variant
  const boxSize = size;
  const nameW = Math.round(size * 3.6);
  const nameH = Math.round(size * 0.72);
  const fs1 = Math.round(size * 0.187);
  const fs2 = Math.round(size * 0.139);
  const ny1 = Math.round(nameH * 0.5);
  const ny2 = Math.round(nameH * 0.9);
  const divW = Math.round(nameW * 0.77);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.28) }}>
      <Icon s={boxSize} />
      <svg width={nameW} height={nameH} viewBox={`0 0 ${nameW} ${nameH}`} fill="none">
        <text x={nameW / 2} y={ny1}
          fontFamily="Montserrat, sans-serif"
          fontSize={fs1} fontWeight="200"
          fill={black} letterSpacing={size * 0.125}
          textAnchor="middle">FASHION</text>
        <text x={nameW / 2} y={ny2}
          fontFamily="Montserrat, sans-serif"
          fontSize={fs2} fontWeight="300"
          fill={groupColor} letterSpacing={size * 0.18}
          textAnchor="middle">GROUP</text>
      </svg>
      <svg width={divW} height="1" viewBox={`0 0 ${divW} 1`}>
        <line x1="0" y1="0.5" x2={divW} y2="0.5" stroke={divColor} strokeWidth="0.5"/>
      </svg>
    </div>
  );
}
