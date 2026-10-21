type IconProps = { size?: number; className?: string; style?: React.CSSProperties };

function base(size = 18, className?: string, style?: React.CSSProperties) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
    'aria-hidden': true,
  };
}

export const IconPlus = ({ size, className, style }: IconProps) => (
  <svg {...base(size, className, style)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconChevronDown = ({ size, className, style }: IconProps) => (
  <svg {...base(size, className, style)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconShield = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3l7 3v5c0 4.2-2.8 8-7 10-4.2-2-7-5.8-7-10V6l7-3z" />
    <path d="M9.2 12.2l1.9 1.9 3.7-3.9" />
  </svg>
);

export const IconGrid = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </svg>
);

export const IconList = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1" />
    <circle cx="3.5" cy="12" r="1" />
    <circle cx="3.5" cy="18" r="1" />
  </svg>
);

export const IconBell = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M18 9a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.3 20a2 2 0 003.4 0" />
  </svg>
);

export const IconSliders = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </svg>
);

export const IconDatabase = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
    <path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    <path d="M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
  </svg>
);

export const IconLogout = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
    <path d="M10 16l-4-4 4-4M6 12h10" />
  </svg>
);

export const IconRefresh = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 11a8 8 0 10-2.3 6.3" />
    <path d="M20 5v6h-6" />
  </svg>
);

export const IconUpload = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 16V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </svg>
);

export const IconSearch = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-3.6-3.6" />
  </svg>
);

export const IconActivity = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 12h4l2.5-7 5 14L17 12h4" />
  </svg>
);

export const IconAlert = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 4l9 16H3l9-16z" />
    <path d="M12 10v4M12 17.2v.1" />
  </svg>
);

export const IconClock = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconCheck = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 12.4l2.6 2.6L16 9.6" />
  </svg>
);

export const IconArrowLeft = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconArrowRight = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconClose = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconFile = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const IconCase = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7M3 12h18" />
    <path d="M10 12v2h4v-2" />
  </svg>
);

export const IconDownload = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
  </svg>
);

export const IconNote = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
    <path d="M14 4v5h5M8 13h8M8 17h5" />
  </svg>
);
