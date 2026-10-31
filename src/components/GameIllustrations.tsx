import React from 'react';

export function HeroControllerIllustration() {
  return (
    <div className="relative w-full max-w-md mx-auto select-none">
      {/* Soft warm glow backdrop */}
      <div className="absolute -inset-4 bg-gradient-to-tr from-amber-300/40 via-orange-200/30 to-white/20 rounded-3xl blur-2xl" />
      <div className="relative bg-white/15 backdrop-blur-md border border-white/35 rounded-3xl p-6 shadow-2xl">
        <svg
          viewBox="0 0 520 380"
          className="w-full h-auto drop-shadow-[0_18px_28px_rgba(124,45,18,0.28)]"
          role="img"
          aria-label="Brightloop 3D Wireless Gaming Controller Illustration"
        >
          <defs>
            <linearGradient id="ctrlBody" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="55%" stopColor="#FFF7ED" />
              <stop offset="100%" stopColor="#FFEDD5" />
            </linearGradient>
            <linearGradient id="ctrlGrip" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FF7A00" />
              <stop offset="100%" stopColor="#EA580C" />
            </linearGradient>
            <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>

          {/* Floating decorative stars & coins */}
          <circle cx="72" cy="64" r="14" fill="url(#goldAccent)" />
          <circle cx="72" cy="64" r="8" fill="#FEF08A" />
          <circle cx="448" cy="78" r="18" fill="url(#goldAccent)" />
          <path d="M448 66 L452 74 L460 75 L454 81 L456 89 L448 85 L440 89 L442 81 L436 75 L444 74 Z" fill="#FFFBEB" />

          {/* Shoulder Triggers */}
          <rect x="135" y="78" width="76" height="28" rx="14" fill="#EA580C" />
          <rect x="309" y="78" width="76" height="28" rx="14" fill="#EA580C" />

          {/* Main Ergonomic Controller Chassis */}
          <path
            d="M142 98 C200 92, 320 92, 378 98 C425 104, 456 146, 464 205 C472 266, 446 328, 405 336 C370 342, 348 298, 326 264 C298 258, 222 258, 194 264 C172 298, 150 342, 115 336 C74 328, 48 266, 56 205 C64 146, 95 104, 142 98 Z"
            fill="url(#ctrlBody)"
            stroke="#FED7AA"
            strokeWidth="4"
          />

          {/* Orange Grip Panels */}
          <path
            d="M60 220 C53 268, 76 322, 113 331 C138 335, 156 308, 174 276 C140 258, 102 232, 60 220 Z"
            fill="url(#ctrlGrip)"
          />
          <path
            d="M460 220 C467 268, 444 322, 407 331 C382 335, 364 308, 346 276 C380 258, 418 232, 460 220 Z"
            fill="url(#ctrlGrip)"
          />

          {/* Center Touchpad */}
          <rect x="196" y="106" width="128" height="58" rx="14" fill="#FFF7ED" stroke="#FDBA74" strokeWidth="2.5" />
          <circle cx="242" cy="135" r="3" fill="#FB923C" />
          <circle cx="260" cy="135" r="3" fill="#FB923C" />
          <circle cx="278" cy="135" r="3" fill="#FB923C" />

          {/* D-Pad Left */}
          <g transform="translate(118, 145)">
            <rect x="24" y="0" width="24" height="72" rx="7" fill="#292524" />
            <rect x="0" y="24" width="72" height="24" rx="7" fill="#292524" />
            <circle cx="36" cy="36" r="7" fill="#44403C" />
          </g>

          {/* Action Buttons Right (A/B/X/Y colorful gems) */}
          <g transform="translate(334, 145)">
            <circle cx="36" cy="12" r="13" fill="#F59E0B" />
            <text x="36" y="17" textAnchor="middle" fill="#FFF" fontSize="12" fontWeight="bold">Y</text>
            <circle cx="36" cy="60" r="13" fill="#EA580C" />
            <text x="36" y="65" textAnchor="middle" fill="#FFF" fontSize="12" fontWeight="bold">A</text>
            <circle cx="12" cy="36" r="13" fill="#0284C7" />
            <text x="12" y="41" textAnchor="middle" fill="#FFF" fontSize="12" fontWeight="bold">X</text>
            <circle cx="60" cy="36" r="13" fill="#16A34A" />
            <text x="60" y="41" textAnchor="middle" fill="#FFF" fontSize="12" fontWeight="bold">B</text>
          </g>

          {/* Analog Thumbsticks */}
          <g>
            <circle cx="206" cy="222" r="28" fill="#FFF7ED" stroke="#FDBA74" strokeWidth="3" />
            <circle cx="206" cy="222" r="20" fill="#292524" />
            <circle cx="206" cy="222" r="12" fill="#F97316" />

            <circle cx="314" cy="222" r="28" fill="#FFF7ED" stroke="#FDBA74" strokeWidth="3" />
            <circle cx="314" cy="222" r="20" fill="#292524" />
            <circle cx="314" cy="222" r="12" fill="#F97316" />
          </g>

          {/* Brightloop Center Emblem */}
          <circle cx="260" cy="188" r="12" fill="url(#ctrlGrip)" />
          <path d="M255 188 L260 181 L265 188 L260 195 Z" fill="#FFF" />
        </svg>

        {/* Bottom Interactive Status Strip inside Hero Card */}
        <div className="mt-3 flex items-center justify-between bg-white/95 rounded-2xl px-4 py-3 text-stone-900 shadow-md">
          <div>
            <p className="text-xs font-medium text-stone-500">Season 8 Battlepass Live</p>
            <p className="text-sm font-bold text-stone-900">180+ Cloud & PC Titles Ready</p>
          </div>
          <span className="text-xs font-mono font-semibold text-orange-700 bg-orange-100 px-3 py-1 rounded-lg">
            +1,200 Gems/mo
          </span>
        </div>
      </div>
    </div>
  );
}

export function GameCoverArtwork({ variant }: { variant: string }) {
  if (variant.includes('Solar') || variant === 'solar') {
    return (
      <svg viewBox="0 0 400 260" className="w-full h-full object-cover" role="img" aria-label="Solar Odyssey Game Art">
        <defs>
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FF7A00" />
            <stop offset="55%" stopColor="#FDBA74" />
            <stop offset="100%" stopColor="#FEF3C7" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#skyGrad)" />
        <circle cx="310" cy="74" r="42" fill="#FEF08A" opacity="0.9" />
        {/* Floating islands */}
        <path d="M40 165 Q95 145 150 165 L130 205 L65 200 Z" fill="#9A3412" />
        <path d="M35 165 Q95 152 155 165 L148 176 L42 175 Z" fill="#F59E0B" />
        <path d="M210 125 Q280 105 350 125 L320 185 L245 180 Z" fill="#7C2D12" />
        <path d="M205 125 Q280 112 355 125 L348 138 L212 136 Z" fill="#FBBF24" />
        {/* Sun Temple Spire */}
        <polygon points="280,58 298,125 262,125" fill="#FFFBEB" />
        <polygon points="95,108 110,162 80,162" fill="#FED7AA" />
        {/* Glider silhouette */}
        <path d="M155 92 L195 78 L178 102 L162 104 Z" fill="#FFFFFF" />
      </svg>
    );
  }

  if (variant.includes('Circuit') || variant === 'circuit') {
    return (
      <svg viewBox="0 0 400 260" className="w-full h-full object-cover" role="img" aria-label="Circuit Drift Game Art">
        <defs>
          <linearGradient id="canyonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EA580C" />
            <stop offset="60%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#FDE047" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#canyonGrad)" />
        {/* Canyon mesas */}
        <polygon points="0,150 90,95 170,150 400,150 400,260 0,260" fill="#7C2D12" />
        {/* Winding track */}
        <path d="M-20 250 Q160 165 240 160 Q320 155 420 220 L420 260 L-20 260 Z" fill="#292524" />
        <path d="M40 245 Q175 175 245 172 Q315 170 380 225" stroke="#F97316" strokeWidth="5" strokeDasharray="14 10" fill="none" />
        {/* Stylized Rally Car */}
        <g transform="translate(155, 162)">
          <rect x="0" y="18" width="96" height="26" rx="10" fill="#FFFFFF" />
          <path d="M18 18 L34 4 L72 4 L84 18 Z" fill="#FFedd5" />
          <rect x="8" y="24" width="80" height="7" rx="3" fill="#EA580C" />
          <circle cx="22" cy="44" r="11" fill="#1C1917" stroke="#FDBA74" strokeWidth="3" />
          <circle cx="74" cy="44" r="11" fill="#1C1917" stroke="#FDBA74" strokeWidth="3" />
        </g>
      </svg>
    );
  }

  if (variant.includes('Aether') || variant === 'aether') {
    return (
      <svg viewBox="0 0 400 260" className="w-full h-full object-cover" role="img" aria-label="Aether Tactics Game Art">
        <defs>
          <linearGradient id="tacticsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="55%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#FEF08A" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#tacticsGrad)" />
        {/* Isometric Hex Board */}
        <polygon points="200,75 330,135 200,195 70,135" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="4" />
        <polygon points="200,195 330,135 330,158 200,218 70,158 70,135" fill="#D97706" />
        {/* Amber Crystal Spires */}
        <polygon points="200,42 222,115 200,128 178,115" fill="#F97316" />
        <polygon points="200,42 222,115 200,128" fill="#FB923C" />
        <polygon points="140,78 154,126 126,126" fill="#0EA5E9" />
        <polygon points="260,78 274,126 246,126" fill="#F59E0B" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 400 260" className="w-full h-full object-cover" role="img" aria-label="Brightloop Gem Vault Art">
      <defs>
        <linearGradient id="vaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#9A3412" />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill="url(#vaultGrad)" />
      <circle cx="200" cy="130" r="78" fill="#FFFBEB" opacity="0.2" />
      <polygon points="200,52 256,110 200,208 144,110" fill="#FEF08A" stroke="#FFFFFF" strokeWidth="4" />
      <polygon points="200,52 256,110 200,132" fill="#FDE047" />
      <polygon points="200,132 256,110 200,208" fill="#F59E0B" />
    </svg>
  );
}
