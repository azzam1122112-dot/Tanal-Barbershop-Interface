import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "home"
  | "reports"
  | "cash"
  | "adjustments"
  | "visits"
  | "barbers"
  | "services"
  | "customers"
  | "loyalty"
  | "campaigns"
  | "whatsapp"
  | "settings"
  | "staff"
  | "logout"
  | "search"
  | "scissors";

const PATHS: Record<IconName, ReactElement> = {
  home: (
    <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
  ),
  reports: (
    <path d="M4 19V5m0 14h16M8 16V11m4 5V8m4 8v-3" />
  ),
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9h.01M18 15h.01" />
    </>
  ),
  adjustments: (
    <path d="M5 7h11m-11 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 10H8m11 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
  ),
  visits: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5 20 17M8 16.5 20 7" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5 20 17M8 16.5 20 7" />
    </>
  ),
  barbers: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11l2 2 4-4" />
    </>
  ),
  services: (
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.4M18 20a6 6 0 0 0-3-5.2" />
    </>
  ),
  loyalty: (
    <path d="m12 4 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L12 4Z" />
  ),
  campaigns: (
    <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1Zm14-1a3 3 0 0 1 0 6" />
  ),
  whatsapp: (
    <path d="M5 19l1.2-3.2A7 7 0 1 1 9 18.2L5 19Zm4.5-9.2c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3-.1.5.3.6 1.1 1.4 1.8 1.7.2.1.4.1.5 0l.5-.5c.2-.2.3-.2.5-.1l1.3.7c.2.1.3.3.3.5 0 .6-.5 1.2-1 1.3-.5.1-1 .2-2.4-.4-1.9-.8-3.1-2.7-3.2-2.9-.1-.2-.8-1.1-.8-2 0-1 .5-1.4.7-1.6Z" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M19.8 7.5l-1.9 1.1M6.1 15.4l-1.9 1.1" />
    </>
  ),
  staff: (
    <path d="M12 3 5 6v5c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6l-7-3Zm-2.5 9 1.8 1.8L15 9.6" />
  ),
  logout: (
    <path d="M15 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2M10 8l-4 4 4 4M6 12h11" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
