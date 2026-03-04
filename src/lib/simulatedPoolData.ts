// Simulated pool data - clearly marked as non-production data
// Realistic for a platform launched ~2 months ago
// This does NOT interfere with real thrift groups

export interface SimulatedGroup {
  id: string;
  name: string;
  contributionAmount: number;
  memberCount: number;
  maxMembers: number;
  cycleDuration: string;
  period: "daily" | "weekly" | "monthly";
  badgeRequired: "gold" | "silver" | "platinum" | "bronze";
  completionPercent: number;
  status: "active" | "almost_full" | "full" | "upcoming" | "completed";
  adminAvatar: string;
  adminName: string;
  rating: number;
  startsIn?: string;
}

export interface ActivityMessage {
  id: string;
  emoji: string;
  message: string;
  timeAgo: string;
  type: "completion" | "milestone" | "slots" | "badge" | "cycle";
}

const AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Ada",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Chidi",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Ngozi",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Emeka",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Kemi",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Tunde",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aisha",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Bola",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Femi",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Zainab",
];

const ADMIN_NAMES = [
  "Ada O.", "Chidi N.", "Ngozi E.", "Emeka A.", "Kemi B.",
  "Tunde F.", "Aisha M.", "Bola S.", "Femi K.", "Zainab H.",
];

// Realistic for 2-month-old platform: 8 groups, modest member counts, 1 completed cycle
export const SIMULATED_GROUPS: SimulatedGroup[] = [
  { id: "sim-1", name: "Emerald Circle", contributionAmount: 20000, memberCount: 5, maxMembers: 6, cycleDuration: "6 months", period: "monthly", badgeRequired: "gold", completionPercent: 83, status: "almost_full", adminAvatar: AVATARS[0], adminName: ADMIN_NAMES[0], rating: 4.2 },
  { id: "sim-2", name: "Hustlers Hub", contributionAmount: 5000, memberCount: 5, maxMembers: 5, cycleDuration: "5 months", period: "monthly", badgeRequired: "silver", completionPercent: 100, status: "full", adminAvatar: AVATARS[1], adminName: ADMIN_NAMES[1], rating: 4.5 },
  { id: "sim-3", name: "Sapphire Savers", contributionAmount: 10000, memberCount: 4, maxMembers: 6, cycleDuration: "6 months", period: "monthly", badgeRequired: "silver", completionPercent: 66, status: "active", adminAvatar: AVATARS[2], adminName: ADMIN_NAMES[2], rating: 4.0 },
  { id: "sim-4", name: "The Force", contributionAmount: 30000, memberCount: 3, maxMembers: 5, cycleDuration: "5 months", period: "monthly", badgeRequired: "gold", completionPercent: 60, status: "active", adminAvatar: AVATARS[3], adminName: ADMIN_NAMES[3], rating: 3.8 },
  { id: "sim-5", name: "Weekly Risers", contributionAmount: 2000, memberCount: 4, maxMembers: 4, cycleDuration: "4 weeks", period: "weekly", badgeRequired: "bronze", completionPercent: 100, status: "completed", adminAvatar: AVATARS[4], adminName: ADMIN_NAMES[4], rating: 4.7 },
  { id: "sim-6", name: "Naija Builders", contributionAmount: 15000, memberCount: 3, maxMembers: 6, cycleDuration: "6 months", period: "monthly", badgeRequired: "gold", completionPercent: 50, status: "active", adminAvatar: AVATARS[5], adminName: ADMIN_NAMES[5], rating: 3.5 },
  { id: "sim-7", name: "Cash Queens", contributionAmount: 8000, memberCount: 0, maxMembers: 5, cycleDuration: "5 months", period: "monthly", badgeRequired: "silver", completionPercent: 0, status: "upcoming", adminAvatar: AVATARS[6], adminName: ADMIN_NAMES[6], rating: 0, startsIn: "4 days" },
  { id: "sim-8", name: "Savings Warriors", contributionAmount: 5000, memberCount: 3, maxMembers: 4, cycleDuration: "4 months", period: "monthly", badgeRequired: "bronze", completionPercent: 75, status: "almost_full", adminAvatar: AVATARS[7], adminName: ADMIN_NAMES[7], rating: 4.1 },
];

// Realistic activity for early-stage platform
const ACTIVITY_TEMPLATES: Omit<ActivityMessage, "id" | "timeAgo">[] = [
  { emoji: "🎉", message: "Weekly Risers completed their first cycle — congrats to all members!", type: "completion" },
  { emoji: "🔥", message: "Emerald Circle needs 1 more member to start their cycle.", type: "slots" },
  { emoji: "👋", message: "Cash Queens opening soon — Silver badge holders can join.", type: "cycle" },
  { emoji: "💰", message: "Hustlers Hub is now full. Cycle 1 contributions begin this week.", type: "cycle" },
  { emoji: "⏳", message: "Savings Warriors has 1 slot remaining.", type: "slots" },
  { emoji: "✅", message: "Sapphire Savers members hit 100% on-time contributions for Cycle 1.", type: "milestone" },
  { emoji: "🌟", message: "The Force welcomed a new member — 2 spots left.", type: "slots" },
  { emoji: "📈", message: "Naija Builders is growing — 3 members and counting.", type: "milestone" },
  { emoji: "🏅", message: "Weekly Risers members earned credit score boosts after completing Cycle 1.", type: "badge" },
  { emoji: "🚀", message: "8 thrift groups created in WeSave's first 2 months!", type: "milestone" },
];

const TIME_AGOS = [
  "just now", "2 mins ago", "5 mins ago", "12 mins ago", "25 mins ago",
  "40 mins ago", "1 hr ago", "2 hrs ago", "4 hrs ago", "6 hrs ago",
];

export function generateActivityFeed(): ActivityMessage[] {
  return ACTIVITY_TEMPLATES.map((t, i) => ({
    ...t,
    id: `activity-${i}`,
    timeAgo: TIME_AGOS[i % TIME_AGOS.length],
  }));
}

export function getStatusColor(status: SimulatedGroup["status"]): string {
  switch (status) {
    case "completed": return "text-success";
    case "almost_full": return "text-warning";
    case "active": return "text-primary";
    case "full": return "text-success";
    case "upcoming": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
}

export function getStatusBg(status: SimulatedGroup["status"]): string {
  switch (status) {
    case "completed": return "bg-success/10 border-success/30";
    case "almost_full": return "bg-warning/10 border-warning/30";
    case "active": return "bg-primary/5 border-primary/20";
    case "full": return "bg-success/10 border-success/30";
    case "upcoming": return "bg-muted/20 border-border";
    default: return "bg-card border-border";
  }
}

export function getBadgeColor(badge: SimulatedGroup["badgeRequired"]): string {
  switch (badge) {
    case "platinum": return "bg-gradient-to-r from-silver to-muted text-foreground";
    case "gold": return "bg-gold text-gold-foreground";
    case "silver": return "bg-silver text-silver-foreground";
    case "bronze": return "bg-bronze text-bronze-foreground";
    default: return "bg-secondary text-secondary-foreground";
  }
}

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG").format(amount);
}
