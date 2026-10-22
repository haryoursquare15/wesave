import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronRight, Copy, CreditCard, Eye, EyeOff, History, Landmark, Plus, ReceiptText, ShieldCheck, Sparkles, Users, PiggyBank, Wallet, Target, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { customerFirstName, cleanCustomerName } from "@/lib/customerName";
import { describeTransaction } from "@/lib/transactionLabels";
import { SpendLockCard } from "./SpendLockCard";

interface BalanceData { totalBalance: number; availableBalance: number; lockedBalance: number; savingsBalance: number; accountNumber: string; fullName: string; noVfdAccount?: boolean; stale?: boolean; }
interface Transaction { id: string; transaction_type: string; amount: number; description: string | null; reference: string | null; status: string; created_at: string; }
interface Props { balance: BalanceData; onNavigate: (view: string) => void; recentTransactions?: Transaction[]; tier?: string | null; upgradePending?: boolean; }
const money = (value: number) => "₦" + Number(value || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortMoney = (value: number) => "₦" + Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });
const tierNames: Record<string,string> = {tier1:"Tier 1",tier2:"Tier 2",tier3:"Tier 3"};
const actions: {label:string;note:string;icon:LucideIcon;go:string}[] = [
 {label:"Add money",note:"Fund your wallet",icon:Plus,go:"fund"},
 {label:"Send money",note:"Bank transfers",icon:ArrowUpRight,go:"transfer"},
 {label:"Withdraw",note:"Access your funds",icon:ArrowDownLeft,go:"withdraw"},
 {label:"Pay bills",note:"Everyday payments",icon:ReceiptText,go:"bills"},
];
const journeys: {eyebrow:string;title:string;description:string;icon:LucideIcon;go:string}[] = [
 {eyebrow:"Savings",title:"Savings plans",description:"Build a plan around what matters to you, at your own pace.",icon:PiggyBank,go:"lock"},
 {eyebrow:"Groups",title:"Ajo & Esusu",description:"Manage contributions and collections in your Ajo circle.",icon:Users,go:"ajo"},
 {eyebrow:"Payments",title:"Split payments",description:"A simpler way to settle shared expenses.",icon:CreditCard,go:"split"},
 {eyebrow:"Insights",title:"Money insights",description:"See the picture behind your money and spending.",icon:Target,go:"insights"},
];
export function VestaraSignatureDashboard({ balance, onNavigate, recentTransactions = [], tier, upgradePending = false }: Props) {
 const [showBalance,setShowBalance] = useState(true);
 const [copied,setCopied] = useState(false);
 const firstName = customerFirstName(balance.fullName, "") || "there";
 const displayName = cleanCustomerName(balance.fullName?.trim()) || balance.fullName || "Account holder";
 const validNumber = !!balance.accountNumber && balance.accountNumber !== "—" && balance.accountNumber !== "1001695610";
 const sections = useMemo(() => [
   { label:"Available", amount:Math.max(0,Number(balance.availableBalance||0)), tone:"available" },
   { label:"In savings", amount:Math.max(0,Number(balance.savingsBalance||0)), tone:"savings" },
   { label:"Locked away", amount:Math.max(0,Number(balance.lockedBalance||0)), tone:"locked" },
 ], [balance.availableBalance,balance.savingsBalance,balance.lockedBalance]);
 const allocated = sections.reduce((sum,item)=>sum+item.amount,0);
 const copyAccount = async () => {
   if (!validNumber) { onNavigate("kyc"); return; }
   try { await navigator.clipboard.writeText(balance.accountNumber); setCopied(true); toast.success("Account number copied"); window.setTimeout(()=>setCopied(false),1900); }
   catch { toast.error("Copy failed. Please select the number to copy."); }
 };
 const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
 return (
 <div className="signature-dashboard">
   <header className="signature-welcome">
     <div className="signature-welcome-copy"><div className="signature-greeting">{greeting}, {firstName}</div><h1>Your overview</h1><p>Your money and everyday banking, all in one place.</p></div>
   </header>
   <div className="signature-hero-grid">
     <section className="signature-money-panel" aria-label="Your account balance">
       <div className="signature-money-top"><span>Account balance</span><span><ShieldCheck size={14}/> Secure</span></div>
       <div className="signature-money-center"><div className="signature-balance-label"><span>Total balance</span><button type="button" onClick={()=>setShowBalance(v=>!v)} aria-label={showBalance ? "Hide balance" : "Show balance"}>{showBalance ? <Eye size={16}/> : <EyeOff size={16}/>} {showBalance ? "Hide" : "Show"}</button></div><div className="signature-big-money" aria-live="polite">{showBalance ? money(balance.totalBalance) : "₦ ••••••"}</div><p>{balance.noVfdAccount ? "Complete verification to activate your account." : balance.stale ? "Showing the most recently available balance." : "Your current money, at a glance."}</p></div>
       <div className="signature-money-bottom"><button className="signature-primary-action" type="button" onClick={()=>onNavigate("fund")}>Add money <ArrowUpRight size={18}/></button><button className="signature-secondary-action" type="button" onClick={()=>onNavigate("transfer")}>Send money <ArrowRight size={18}/></button></div><span className="signature-hero-monogram" aria-hidden="true">V</span>
     </section>
     <section className="signature-account-panel" aria-label="Your VFD account information">
       <div className="signature-account-top"><span>Account details</span><Landmark size={21} strokeWidth={1.4}/></div>
       <div className="signature-account-holder"><span>Account holder</span><strong>{displayName}</strong><small>VFD Microfinance Bank</small></div>
       <div className="signature-account-copy"><span>Account number</span><button type="button" onClick={copyAccount} aria-label={validNumber ? "Copy account number" : "Activate account"}>{validNumber ? balance.accountNumber : "Activate account"}{copied ? <Check size={18}/> : validNumber ? <Copy size={18}/> : <ArrowUpRight size={18}/>}</button></div>
       <div className="signature-account-foot"><span><BadgeCheck size={15}/>{upgradePending ? "Upgrade pending" : (tierNames[(tier || "tier1").toLowerCase()] || "Personal account")}</span>{(tier || "tier1").toLowerCase() !== "tier3" && !upgradePending && <button type="button" onClick={()=>onNavigate("kyc")}>Upgrade <ArrowUpRight size={15}/></button>}</div>
     </section>
   </div>
   <section className="signature-composition" aria-label="Balance breakdown"><div className="signature-composition-label"><span>Balance breakdown</span><strong>Where your money sits</strong></div><div className="signature-composition-items">{sections.map((item)=><div className="signature-composition-item" key={item.tone}><span><i className={"signature-key signature-key-"+item.tone}/>{item.label}</span><strong>{showBalance ? shortMoney(item.amount) : "••••••"}</strong><small>{allocated>0 && showBalance ? Math.round(item.amount/allocated*100)+"% of allocated funds" : "—"}</small></div>)}</div><div className="signature-composition-bar" role="img" aria-label="Share of available, savings and locked money">{allocated>0 ? sections.filter(item=>item.amount>0).map(item=><span key={item.tone} className={"signature-bar-"+item.tone} style={{width:(item.amount/allocated*100)+"%"}}/>) : <span className="signature-bar-empty"/>}</div></section>
   <section className="signature-section"><div className="signature-section-title"><div><span>Payments</span><h2>Quick actions</h2></div><p>Your most-used services, within easy reach.</p></div><div className="signature-actions">{actions.map(action=><button className="signature-action-tile" key={action.go} type="button" onClick={()=>onNavigate(action.go)}><span className="signature-action-top"><span>{action.note}</span><action.icon size={23} strokeWidth={1.6}/></span><span className="signature-action-copy"><strong>{action.label}</strong><small>{action.note}</small></span><ArrowUpRight className="signature-action-chevron" size={18}/></button>)}</div></section>
   <section className="signature-feature-grid">
     <div className="signature-activity"><div className="signature-section-title"><div><span>Transactions</span><h2>Recent activity</h2></div><button type="button" onClick={()=>onNavigate("history")}>See all <ArrowUpRight size={16}/></button></div>{recentTransactions.length ? <div className="signature-transactions">{recentTransactions.slice(0,5).map(tx=>{const item=describeTransaction(tx);return <button type="button" className="signature-transaction" key={tx.id} onClick={()=>onNavigate("history")}><span className={"signature-transaction-icon "+(item.isCredit?"credit":"debit")}>{item.isCredit?<ArrowDownLeft size={19}/>:<ArrowUpRight size={19}/>}</span><span className="signature-transaction-copy"><strong>{item.title}</strong><small>{new Date(tx.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}</small></span><strong className="signature-transaction-money">{showBalance?(item.isCredit?"+":"−")+shortMoney(tx.amount):"••••••"}</strong><ChevronRight size={15}/></button>})}</div> : <div className="signature-activity-empty"><History size={28} strokeWidth={1.3}/><strong>Your story starts here.</strong><p>Transactions will appear here once your account is in use.</p><button type="button" onClick={()=>onNavigate("fund")}>Add money <ArrowUpRight size={16}/></button></div>}</div>
     <aside className="signature-feature"><div className="signature-feature-top"><span>Savings</span><Sparkles size={21} strokeWidth={1.4}/></div><div><h2>Save at your own pace.</h2><p>Choose a plan, set a goal and keep track of your progress.</p></div><button type="button" onClick={()=>onNavigate("lock")}>Start saving <ArrowUpRight size={19}/></button></aside>
   </section>
   <section className="signature-section signature-explore"><div className="signature-section-title"><div><span>Explore</span><h2>More with Vestara</h2></div><button type="button" onClick={()=>onNavigate("insights")}>Money insights <ArrowUpRight size={16}/></button></div><div className="signature-journeys">{journeys.map(journey=><button type="button" className="signature-journey" key={journey.go} onClick={()=>onNavigate(journey.go)}><span className="signature-journey-icon"><journey.icon size={26} strokeWidth={1.5}/></span><span className="signature-journey-copy"><small>{journey.eyebrow}</small><strong>{journey.title}</strong><span>{journey.description}</span></span><span className="signature-journey-arrow"><ArrowUpRight size={21}/></span></button>)}</div></section>
   <section className="signature-spend-control"><div><span>Spending controls</span><h2>Stay in control</h2><p>Manage your spending limits and protections.</p></div><SpendLockCard /></section>
 </div>
 );
}
