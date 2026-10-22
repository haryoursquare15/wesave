import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronRight, Copy, CreditCard, Eye, EyeOff, History, Landmark, Plus, ReceiptText, ShieldCheck, Sparkles, Users, PiggyBank, Wallet, Target, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { customerFirstName, cleanCustomerName } from "@/lib/customerName";
import { describeTransaction } from "@/lib/transactionLabels";
import { SpendLockCard } from "./SpendLockCard";

interface BalanceData { totalBalance: number; availableBalance: number; lockedBalance: number; savingsBalance: number; accountNumber: string; fullName: string; noVfdAccount?: boolean; stale?: boolean; }
interface Transaction { id: string; transaction_type: string; amount: number; description: string | null; reference: string | null; status: string; created_at: string; }
interface Props { balance: BalanceData; onNavigate: (view: string) => void; recentTransactions?: Transaction[]; tier?: string | null; upgradePending?: boolean; avatarUrl?: string | null; }
const money = (value: number) => "₦" + Number(value || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortMoney = (value: number) => "₦" + Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });
const tierNames: Record<string,string> = {tier1:"Tier 1",tier2:"Tier 2",tier3:"Tier 3"};
const actions: {number:string;label:string;note:string;icon:LucideIcon;go:string}[] = [
 {number:"01",label:"Add money",note:"Fund your wallet",icon:Plus,go:"fund"},
 {number:"02",label:"Send money",note:"Bank transfers",icon:ArrowUpRight,go:"transfer"},
 {number:"03",label:"Withdraw",note:"Access your funds",icon:ArrowDownLeft,go:"withdraw"},
 {number:"04",label:"Pay bills",note:"Everyday payments",icon:ReceiptText,go:"bills"},
];
const journeys: {number:string;eyebrow:string;title:string;description:string;icon:LucideIcon;go:string}[] = [
 {number:"01",eyebrow:"PERSONAL WEALTH",title:"A better way to save.",description:"Build a plan around what matters to you, at your own pace.",icon:PiggyBank,go:"lock"},
 {number:"02",eyebrow:"COMMUNITY SAVINGS",title:"Money moves together.",description:"Manage contributions and collections in your Ajo circle.",icon:Users,go:"ajo"},
 {number:"03",eyebrow:"SHARED PAYMENTS",title:"Keep it fair. Split it.",description:"A simpler way to settle shared expenses.",icon:CreditCard,go:"split"},
 {number:"04",eyebrow:"MONEY INTELLIGENCE",title:"Know your numbers.",description:"See the picture behind your money and spending.",icon:Target,go:"insights"},
];
export function VestaraSignatureDashboard({ balance, onNavigate, recentTransactions = [], tier, upgradePending = false, avatarUrl }: Props) {
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
     <div><div className="signature-eyebrow"><span className="signature-dot" />THE VESTARA EDITION <span className="signature-slash">/</span> PERSONAL BANKING</div><div className="signature-greeting">{greeting}, {firstName}.</div><h1>Money, in <em>good hands.</em></h1><p>Everything in its place. Every possibility ahead.</p></div>
     <button type="button" className="signature-avatar-trigger" onClick={()=>onNavigate("profile")} aria-label="Open your profile"><Avatar className="signature-avatar"><AvatarImage src={avatarUrl || undefined} alt="Profile" /><AvatarFallback>{firstName.charAt(0).toUpperCase()}</AvatarFallback></Avatar><ArrowUpRight size={17}/></button>
   </header>
   <div className="signature-hero-grid">
     <section className="signature-money-panel" aria-label="Your account balance">
       <div className="signature-money-top"><span>01 / YOUR MONEY</span><span><ShieldCheck size={14}/> SECURE BANKING</span></div>
       <div className="signature-money-center"><div className="signature-balance-label"><span>Total balance</span><button type="button" onClick={()=>setShowBalance(v=>!v)} aria-label={showBalance ? "Hide balance" : "Show balance"}>{showBalance ? <Eye size={16}/> : <EyeOff size={16}/>} {showBalance ? "Hide" : "Show"}</button></div><div className="signature-big-money" aria-live="polite">{showBalance ? money(balance.totalBalance) : "₦ ••••••"}</div><p>{balance.noVfdAccount ? "Complete verification to activate your account." : balance.stale ? "Showing the most recently available balance." : "One clear view of everything you've built."}</p></div>
       <div className="signature-money-bottom"><button className="signature-primary-action" type="button" onClick={()=>onNavigate("fund")}>Add money <ArrowUpRight size={18}/></button><button className="signature-secondary-action" type="button" onClick={()=>onNavigate("transfer")}>Send money <ArrowRight size={18}/></button></div><span className="signature-hero-monogram" aria-hidden="true">V</span>
     </section>
     <section className="signature-account-panel" aria-label="Your VFD account information">
       <div className="signature-account-top"><span>02 / YOUR ACCOUNT</span><Landmark size={21} strokeWidth={1.4}/></div>
       <div className="signature-account-holder"><span>ACCOUNT HOLDER</span><strong>{displayName}</strong><small>VFD Microfinance Bank</small></div>
       <div className="signature-account-copy"><span>ACCOUNT NUMBER</span><button type="button" onClick={copyAccount} aria-label={validNumber ? "Copy account number" : "Activate account"}>{validNumber ? balance.accountNumber : "Activate account"}{copied ? <Check size={18}/> : validNumber ? <Copy size={18}/> : <ArrowUpRight size={18}/>}</button></div>
       <div className="signature-account-foot"><span><BadgeCheck size={15}/>{upgradePending ? "Upgrade pending" : (tierNames[(tier || "tier1").toLowerCase()] || "Personal account")}</span>{(tier || "tier1").toLowerCase() !== "tier3" && !upgradePending && <button type="button" onClick={()=>onNavigate("kyc")}>Upgrade <ArrowUpRight size={15}/></button>}</div>
     </section>
   </div>
   <section className="signature-composition" aria-label="Balance breakdown"><div className="signature-composition-label"><span>AT A GLANCE</span><strong>Your money.<br/>Beautifully accounted for.</strong></div><div className="signature-composition-items">{sections.map((item,index)=><div className="signature-composition-item" key={item.tone}><span><i className={"signature-key signature-key-"+item.tone}/>0{index+1} / {item.label}</span><strong>{showBalance ? shortMoney(item.amount) : "••••••"}</strong><small>{allocated>0 && showBalance ? Math.round(item.amount/allocated*100)+"% of allocated funds" : "—"}</small></div>)}</div><div className="signature-composition-bar" role="img" aria-label="Share of available, savings and locked money">{allocated>0 ? sections.filter(item=>item.amount>0).map(item=><span key={item.tone} className={"signature-bar-"+item.tone} style={{width:(item.amount/allocated*100)+"%"}}/>) : <span className="signature-bar-empty"/>}</div></section>
   <section className="signature-section"><div className="signature-section-title"><div><span>03 / EVERYDAY BANKING</span><h2>Make your next <em>move.</em></h2></div><p>Your essentials, just a touch away.</p></div><div className="signature-actions">{actions.map(action=><button className="signature-action-tile" key={action.go} type="button" onClick={()=>onNavigate(action.go)}><span className="signature-action-top"><span>{action.number} / ACTION</span><action.icon size={23} strokeWidth={1.6}/></span><span className="signature-action-copy"><strong>{action.label}</strong><small>{action.note}</small></span><ArrowUpRight className="signature-action-chevron" size={18}/></button>)}</div></section>
   <section className="signature-feature-grid">
     <div className="signature-activity"><div className="signature-section-title"><div><span>04 / RECENT MOVEMENTS</span><h2>What's been <em>moving.</em></h2></div><button type="button" onClick={()=>onNavigate("history")}>See all <ArrowUpRight size={16}/></button></div>{recentTransactions.length ? <div className="signature-transactions">{recentTransactions.slice(0,5).map(tx=>{const item=describeTransaction(tx);return <button type="button" className="signature-transaction" key={tx.id} onClick={()=>onNavigate("history")}><span className={"signature-transaction-icon "+(item.isCredit?"credit":"debit")}>{item.isCredit?<ArrowDownLeft size={19}/>:<ArrowUpRight size={19}/>}</span><span className="signature-transaction-copy"><strong>{item.title}</strong><small>{new Date(tx.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}</small></span><strong className="signature-transaction-money">{showBalance?(item.isCredit?"+":"−")+shortMoney(tx.amount):"••••••"}</strong><ChevronRight size={15}/></button>})}</div> : <div className="signature-activity-empty"><History size={28} strokeWidth={1.3}/><strong>Your story starts here.</strong><p>Transactions will appear here once your account is in use.</p><button type="button" onClick={()=>onNavigate("fund")}>Add money <ArrowUpRight size={16}/></button></div>}</div>
     <aside className="signature-feature"><div className="signature-feature-top"><span>THE ART OF SAVING</span><Sparkles size={21} strokeWidth={1.4}/></div><div><span className="signature-feature-index">A NEW PERSPECTIVE</span><h2>Big dreams.<br/><em>Small beginnings.</em></h2><p>Whether it's tomorrow or the long game, give your goals a place to grow.</p></div><button type="button" onClick={()=>onNavigate("lock")}>Start saving <ArrowUpRight size={19}/></button></aside>
   </section>
   <section className="signature-section signature-explore"><div className="signature-section-title"><div><span>05 / DISCOVER VESTARA</span><h2>Life is more than <em>banking.</em></h2></div><button type="button" onClick={()=>onNavigate("insights")}>Money insights <ArrowUpRight size={16}/></button></div><div className="signature-journeys">{journeys.map(journey=><button type="button" className="signature-journey" key={journey.number} onClick={()=>onNavigate(journey.go)}><span className="signature-journey-index">{journey.number}</span><span className="signature-journey-icon"><journey.icon size={26} strokeWidth={1.5}/></span><span className="signature-journey-copy"><small>{journey.eyebrow}</small><strong>{journey.title}</strong><span>{journey.description}</span></span><span className="signature-journey-arrow"><ArrowUpRight size={21}/></span></button>)}</div></section>
   <section className="signature-spend-control"><div><span>06 / CONTROL CENTRE</span><h2>Always in control.</h2><p>Keep your spending and saving exactly how you like it.</p></div><SpendLockCard /></section>
 </div>
 );
}
