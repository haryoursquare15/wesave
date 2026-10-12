import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type QA = { q: string; a: string };
type Section = { title: string; items: QA[] };

const SECTIONS: Section[] = [
  {
    title: "Getting started & account",
    items: [
      { q: "What is Vestara?", a: "Vestara is a savings and money app. You get your own account number, and you can save, run thrift (Ajo) groups with people you trust, split bills, pay bills and fund campaigns, all in one place." },
      { q: "How do I fund my wallet?", a: "Send money by bank transfer from any Nigerian bank to the account number on your Home screen. It usually shows within a few minutes. If it hasn't arrived after 15 minutes, contact support with the sender's bank and the amount." },
      { q: "What are account tiers?", a: "Your tier sets how much you can send and hold each day. Tier 1 needs your BVN or NIN. Higher tiers need more ID documents. You can see your tier in Profile → Account tier and limits. Tier 3 is the highest tier." },
      { q: "How do I upgrade my tier?", a: "Go to Profile → Account tier and limits → Upgrade my tier. Choose the tier, fill in your details and upload the documents asked for (a government ID, and for Tier 3 also a utility bill and a passport photo). Reviews usually take up to 24 hours." },
      { q: "Is my money safe?", a: "Your funds are held with our licensed banking partner, and every movement is recorded in a ledger that is checked every day. Never share your PINs, password or one-time codes with anyone, including people who say they work for Vestara." },
    ],
  },
  {
    title: "Transfers & withdrawals",
    items: [
      { q: "Where does my withdrawal go?", a: "Withdrawals always go to the withdrawal bank you set up in Profile. You only set it once: choose your bank, enter your account number and we check the account name before saving." },
      { q: "Can I change my withdrawal bank?", a: "To keep your money safe, you can't change it in the app. Email support@vestara.ng from your registered email and we'll verify your identity and update it." },
      { q: "Why did my transfer fail?", a: "Common reasons are not enough available balance, going over your tier's daily limit, a wrong PIN, or the receiving bank being temporarily unavailable. If money left your wallet but didn't arrive, it is reversed automatically. Contact support if it hasn't come back within 24 hours." },
      { q: "Are there transfer fees?", a: "Transfers between Vestara accounts are free. A small fee may apply to transfers to other banks, and you'll always see it before you confirm." },
    ],
  },
  {
    title: "Savings plans",
    items: [
      { q: "What savings plans are there?", a: "GoalSave: save towards a target, with a flexible schedule.\nVault: lock money for a set period and earn more.\nLockMax: our highest rate, for longer locks.\nUpfront Yield: get your interest paid at the start; the money stays locked until the end date." },
      { q: "How is interest calculated?", a: "Interest is added daily on your locked amount at the rate shown when you created the plan. That rate stays fixed for the plan, even if our rates change later." },
      { q: "Can I break a plan early?", a: "GoalSave, Vault and LockMax can be ended early, but you lose part of the interest earned. Upfront Yield can't be ended early because you've already received the interest." },
      { q: "What happens when my plan ends?", a: "Your savings and interest go back to your wallet automatically on the end date. You'll get a notification." },
      { q: "What is direct debit (e-mandate) for savings?", a: "An e-mandate lets Vestara collect your savings or thrift contributions from your bank on schedule. Setting it up costs ₦100. You need to complete your bank's authorisation within 7 days, or the mandate expires." },
    ],
  },
  {
    title: "Thrift (Ajo) groups",
    items: [
      { q: "How does a thrift group work?", a: "Members contribute the same amount on a schedule. Each round, one member receives the full pot, until everyone has had a turn." },
      { q: "What are the group rules?", a: "A group has 2 to 20 members, and the minimum contribution is ₦500. The payout order is set before the group starts, and members can ask to swap positions during the swap window." },
      { q: "Can contributions come from my wallet?", a: "Yes. When creating a group, the admin can choose wallet funding (contributions come from members' Vestara wallets) or direct debit (contributions come from members' bank accounts through a mandate)." },
      { q: "What if a member misses a contribution?", a: "A round only pays out once every member has paid in full. A member who pays late or doesn't have enough on a scheduled day may be charged a penalty. Everyone in the group can see their status." },
      { q: "When do I get my payout?", a: "On your round's payout date, once everyone has contributed. It goes into your Vestara wallet, and you'll get a notification." },
    ],
  },
  {
    title: "Split Pay & bills",
    items: [
      { q: "How does Split Pay work?", a: "Create a split, add people and amounts, and share it. Each person pays their share in the app. When everyone has paid, the bill is settled." },
      { q: "Which bills can I pay?", a: "Airtime, data, electricity, cable TV and more from the Services screen. You can save billers as beneficiaries for faster payments." },
      { q: "My bill payment is pending. What should I do?", a: "Some billers take a few minutes to confirm. We check automatically, and if it fails, the money is refunded to your wallet. You don't need to pay again." },
    ],
  },
  {
    title: "Campaigns (crowdfunding)",
    items: [
      { q: "How do I raise money with a campaign?", a: "Create a campaign with a goal and a description, then share its link. Anyone can contribute, even without a Vestara account, and your progress updates automatically after each payment is confirmed." },
      { q: "How do I get the money raised?", a: "Withdrawals from a campaign go to your Vestara wallet, and from there to your withdrawal bank." },
    ],
  },
  {
    title: "Spending limits (SpendLock) & insights",
    items: [
      { q: "What is SpendLock?", a: "SpendLock lets you set a weekly or monthly budget for bank transfers and bill payments. Money moved into savings doesn't count towards it. Your limit can't be higher than your tier's limit." },
      { q: "Can I unlock my limit?", a: "Yes, you're always in control. You can unlock straight away with your PIN, or choose a 30-minute cooling-off period first." },
      { q: "What are Insights?", a: "Insights look at your spending patterns, such as repeating payments, upcoming bills and your average weekly spend. They suggest a limit and point you to savings products that may suit you. They never change your settings on their own." },
    ],
  },
  {
    title: "Security & sign-in",
    items: [
      { q: "What's the difference between my PINs?", a: "Your 6-digit login PIN opens the app on your phone. Your 4-digit transaction PIN approves payments, transfers and savings. Keep them different and never share them." },
      { q: "How do I turn on fingerprint or Face ID?", a: "First set a login PIN, then turn on Profile → Security → Fingerprint / Face ID login. Your phone will ask you to confirm with your fingerprint or face." },
      { q: "Why was I signed out?", a: "Vestara works on one device at a time, so signing in on a new phone signs out the old one, and we email you when this happens. The app also locks itself after a period of inactivity, which you can change in Auto-lock." },
      { q: "I forgot my transaction PIN.", a: "Go to Profile → Transaction PIN → Forgot transaction PIN? and follow the steps, or email support@vestara.ng." },
      { q: "I think someone accessed my account.", a: "Go to Profile → Security → Sign out of all other devices, change your password, and email support@vestara.ng straight away. You can also freeze your account from Profile." },
    ],
  },
  {
    title: "Notifications & support",
    items: [
      { q: "How will I be notified?", a: "You get in-app alerts and emails for every transaction. You can also turn on push notifications in Profile → Notifications. WhatsApp is used only for reminders, never for transaction details." },
      { q: "How do I contact support?", a: "Email support@vestara.ng. Include your registered email and, for payment issues, the amount, date and reference so we can help faster." },
    ],
  },
];

export function SandboxFAQ() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((i) => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)),
    })).filter((s) => s.items.length > 0);
  }, [query]);

  return (
    <div className="space-y-4 pt-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" className="pl-9" aria-label="Search FAQ" />
      </div>
      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No answers found. Email support@vestara.ng and we'll help.</p>
      )}
      {filtered.map((s) => (
        <section key={s.title}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</h3>
          <Accordion type="single" collapsible className="rounded-2xl border border-border px-3">
            {s.items.map((i, idx) => (
              <AccordionItem key={i.q} value={`${s.title}-${idx}`} className={idx === s.items.length - 1 ? "border-b-0" : ""}>
                <AccordionTrigger className="py-3 text-left text-sm font-medium">{i.q}</AccordionTrigger>
                <AccordionContent className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{i.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
    </div>
  );
}
