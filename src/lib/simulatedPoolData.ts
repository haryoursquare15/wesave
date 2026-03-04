// Simulated pool data - clearly marked as non-production data
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
  startsIn?: string; // countdown for upcoming groups
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
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Uche",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Funke",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Yemi",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Halima",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Dele",
];

const ADMIN_NAMES = [
  "Ada O.", "Chidi N.", "Ngozi E.", "Emeka A.", "Kemi B.",
  "Tunde F.", "Aisha M.", "Bola S.", "Femi K.", "Zainab H.",
  "Uche I.", "Funke D.", "Yemi O.", "Halima J.", "Dele W.",
];

export const SIMULATED_GROUPS: SimulatedGroup[] = [
  { id: "sim-1", name: "Emerald Circle", contributionAmount: 20000, memberCount: 7, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "gold", completionPercent: 70, status: "active", adminAvatar: AVATARS[0], adminName: ADMIN_NAMES[0], rating: 4.5 },
  { id: "sim-2", name: "Hustlers Hub", contributionAmount: 5000, memberCount: 4, maxMembers: 5, cycleDuration: "5 months", period: "monthly", badgeRequired: "silver", completionPercent: 80, status: "almost_full", adminAvatar: AVATARS[1], adminName: ADMIN_NAMES[1], rating: 4.8 },
  { id: "sim-3", name: "Emergency Trust", contributionAmount: 50000, memberCount: 12, maxMembers: 12, cycleDuration: "12 months", period: "monthly", badgeRequired: "gold", completionPercent: 100, status: "full", adminAvatar: AVATARS[2], adminName: ADMIN_NAMES[2], rating: 5.0 },
  { id: "sim-4", name: "Young CEOs", contributionAmount: 100000, memberCount: 6, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "platinum", completionPercent: 60, status: "active", adminAvatar: AVATARS[3], adminName: ADMIN_NAMES[3], rating: 4.2 },
  { id: "sim-5", name: "Sapphire Savers", contributionAmount: 10000, memberCount: 8, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "silver", completionPercent: 80, status: "active", adminAvatar: AVATARS[4], adminName: ADMIN_NAMES[4], rating: 4.7 },
  { id: "sim-6", name: "Lagos Elite", contributionAmount: 200000, memberCount: 5, maxMembers: 8, cycleDuration: "8 months", period: "monthly", badgeRequired: "platinum", completionPercent: 62, status: "active", adminAvatar: AVATARS[5], adminName: ADMIN_NAMES[5], rating: 4.9 },
  { id: "sim-7", name: "Naija Builders", contributionAmount: 15000, memberCount: 9, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "gold", completionPercent: 90, status: "almost_full", adminAvatar: AVATARS[6], adminName: ADMIN_NAMES[6], rating: 4.6 },
  { id: "sim-8", name: "Diamond Trust", contributionAmount: 75000, memberCount: 12, maxMembers: 12, cycleDuration: "12 months", period: "monthly", badgeRequired: "gold", completionPercent: 100, status: "completed", adminAvatar: AVATARS[7], adminName: ADMIN_NAMES[7], rating: 5.0 },
  { id: "sim-9", name: "The Force", contributionAmount: 30000, memberCount: 7, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "gold", completionPercent: 70, status: "active", adminAvatar: AVATARS[8], adminName: ADMIN_NAMES[8], rating: 4.3 },
  { id: "sim-10", name: "Weekly Risers", contributionAmount: 3000, memberCount: 3, maxMembers: 5, cycleDuration: "5 weeks", period: "weekly", badgeRequired: "bronze", completionPercent: 60, status: "active", adminAvatar: AVATARS[9], adminName: ADMIN_NAMES[9], rating: 4.1 },
  { id: "sim-11", name: "Cash Queens", contributionAmount: 25000, memberCount: 6, maxMembers: 6, cycleDuration: "6 months", period: "monthly", badgeRequired: "silver", completionPercent: 100, status: "full", adminAvatar: AVATARS[10], adminName: ADMIN_NAMES[10], rating: 4.8 },
  { id: "sim-12", name: "Abuja Stars", contributionAmount: 40000, memberCount: 0, maxMembers: 8, cycleDuration: "8 months", period: "monthly", badgeRequired: "gold", completionPercent: 0, status: "upcoming", adminAvatar: AVATARS[11], adminName: ADMIN_NAMES[11], rating: 0, startsIn: "3 days" },
  { id: "sim-13", name: "PH Ballers", contributionAmount: 60000, memberCount: 11, maxMembers: 12, cycleDuration: "12 months", period: "monthly", badgeRequired: "gold", completionPercent: 91, status: "almost_full", adminAvatar: AVATARS[12], adminName: ADMIN_NAMES[12], rating: 4.4 },
  { id: "sim-14", name: "Savings Warriors", contributionAmount: 8000, memberCount: 5, maxMembers: 8, cycleDuration: "8 months", period: "monthly", badgeRequired: "silver", completionPercent: 62, status: "active", adminAvatar: AVATARS[13], adminName: ADMIN_NAMES[13], rating: 4.0 },
  { id: "sim-15", name: "Covenant Circle", contributionAmount: 150000, memberCount: 4, maxMembers: 6, cycleDuration: "6 months", period: "monthly", badgeRequired: "platinum", completionPercent: 66, status: "active", adminAvatar: AVATARS[14], adminName: ADMIN_NAMES[14], rating: 4.9 },
  { id: "sim-16", name: "Ibadan Connect", contributionAmount: 12000, memberCount: 0, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "silver", completionPercent: 0, status: "upcoming", adminAvatar: AVATARS[0], adminName: ADMIN_NAMES[0], rating: 0, startsIn: "5 days" },
  { id: "sim-17", name: "Daily Grinders", contributionAmount: 1000, memberCount: 4, maxMembers: 5, cycleDuration: "5 days", period: "daily", badgeRequired: "bronze", completionPercent: 80, status: "almost_full", adminAvatar: AVATARS[1], adminName: ADMIN_NAMES[1], rating: 3.9 },
  { id: "sim-18", name: "Prosperity Club", contributionAmount: 35000, memberCount: 8, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "gold", completionPercent: 80, status: "active", adminAvatar: AVATARS[2], adminName: ADMIN_NAMES[2], rating: 4.6 },
  { id: "sim-19", name: "Unity Savers", contributionAmount: 18000, memberCount: 10, maxMembers: 10, cycleDuration: "10 months", period: "monthly", badgeRequired: "gold", completionPercent: 100, status: "completed", adminAvatar: AVATARS[3], adminName: ADMIN_NAMES[3], rating: 5.0 },
  { id: "sim-20", name: "Golden Eagles", contributionAmount: 90000, memberCount: 3, maxMembers: 8, cycleDuration: "8 months", period: "monthly", badgeRequired: "platinum", completionPercent: 37, status: "active", adminAvatar: AVATARS[4], adminName: ADMIN_NAMES[4], rating: 4.1 },
];

const ACTIVITY_TEMPLATES: Omit<ActivityMessage, "id" | "timeAgo">[] = [
  { emoji: "🎉", message: "The Emerald Circle has concluded Cycle 1 — aiming for Gold Badge.", type: "completion" },
  { emoji: "🔥", message: "The Force is looking for 3 more members to complete the group.", type: "slots" },
  { emoji: "🚀", message: "Emergency Trust is now complete. Cycle begins in 2 days.", type: "cycle" },
  { emoji: "💎", message: "Sapphire Savers just unlocked Silver Badge.", type: "badge" },
  { emoji: "⏳", message: "Hustlers Hub has 1 slot remaining.", type: "slots" },
  { emoji: "🏆", message: "Diamond Trust completed all 12 cycles — 100% payout achieved!", type: "completion" },
  { emoji: "🌟", message: "Young CEOs welcomed 2 new members this week.", type: "milestone" },
  { emoji: "💰", message: "Cash Queens Cycle 4 payout processed — ₦150,000 disbursed.", type: "completion" },
  { emoji: "🔔", message: "Naija Builders needs just 1 more member to start.", type: "slots" },
  { emoji: "📈", message: "Lagos Elite credit scores averaging 820+ this quarter.", type: "badge" },
  { emoji: "✅", message: "Unity Savers achieved 100% on-time contributions for Cycle 3.", type: "milestone" },
  { emoji: "🎯", message: "PH Ballers is 1 member away from full capacity.", type: "slots" },
  { emoji: "🏅", message: "Covenant Circle members earned Gold badges after Cycle 2.", type: "badge" },
  { emoji: "⚡", message: "Weekly Risers completed 3 rapid cycles this month.", type: "cycle" },
  { emoji: "💫", message: "Prosperity Club contributed ₦280,000 in total this cycle.", type: "milestone" },
  { emoji: "🎊", message: "Abuja Stars launching in 3 days — early slots filling fast!", type: "cycle" },
  { emoji: "🔐", message: "All active groups maintaining 98% contribution compliance.", type: "milestone" },
  { emoji: "👑", message: "Golden Eagles offering ₦720,000 total payout per cycle.", type: "milestone" },
  { emoji: "💪", message: "Savings Warriors hitting contribution streak of 5 months.", type: "milestone" },
  { emoji: "🌍", message: "Ibadan Connect opening soon — Silver badge required.", type: "cycle" },
];

const TIME_AGOS = [
  "just now", "1 min ago", "2 mins ago", "3 mins ago", "5 mins ago",
  "8 mins ago", "12 mins ago", "15 mins ago", "20 mins ago", "30 mins ago",
  "45 mins ago", "1 hr ago", "2 hrs ago", "3 hrs ago",
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
