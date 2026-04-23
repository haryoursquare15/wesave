import { ArrowLeft, ShieldCheck, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function AmlPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-8">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">AML / CFT Policy</h1>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/compliance/Vestara_AML_Policy_v1.1.docx" download>
              <Download className="h-4 w-4 mr-2" /> DOCX
            </a>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center gap-2 mb-4 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-medium">Effective: April 2026 • Version 1.1</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">VESTARA — ANTI-MONEY LAUNDERING & CFT POLICY</h1>
        <p className="text-muted-foreground mb-6">Operated by LLH Premium Enterprise on vestara.ng. Banking, KYC, transfers, and bills powered exclusively by VFD Microfinance Bank Plc (BaaS). Compliant with MLPPA 2022, CBN AML/CFT/CPF Regulations 2022, and NFIU Guidelines.</p>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">1. Purpose & Scope</h2>
            <p className="text-muted-foreground">Vestara detects, prevents, and reports money laundering and terrorist financing across all digital thrift, savings, target-Ajo, association, SplitPay, and crowdfunding services. Applies to staff, contractors, mobile-app (Android/iOS) wrapper users, and our partner bank VFD Microfinance Bank Plc — the sole banking provider in the sandbox.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">2. Risk-Based Approach</h2>
            <p className="text-muted-foreground">Customers, products, and channels are classified Low / Medium / High risk. Due diligence intensity scales with the assigned rating. PEPs and FATF high-risk jurisdictions are automatically High Risk.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">3. Customer Due Diligence (CDD)</h2>
            <ul className="text-muted-foreground list-disc pl-5 space-y-1">
              <li><strong>Tier 1:</strong> verified phone + email. ₦50k daily / ₦300k cumulative.</li>
              <li><strong>Tier 2:</strong> BVN + government ID. ₦200k daily / ₦500k cumulative.</li>
              <li><strong>Tier 3 (EDD):</strong> proof of address, source-of-funds, senior management approval.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">4. Transaction Monitoring</h2>
            <p className="text-muted-foreground">Real-time alerts on velocity spikes, structuring near reporting thresholds, dormant-to-active patterns, unusual goal-funding clusters, and repeated failed verifications.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">5. Reporting</h2>
            <ul className="text-muted-foreground list-disc pl-5 space-y-1">
              <li><strong>CTRs:</strong> ≥ ₦5M (individual) or ≥ ₦10M (corporate) reported to NFIU within 7 days.</li>
              <li><strong>STRs:</strong> any suspicious activity reported to NFIU within 24 hours.</li>
              <li><strong>Terrorism financing:</strong> immediate freeze and report to NFIU and ONSA.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">6. Sanctions Screening</h2>
            <p className="text-muted-foreground">All customers screened against UN, Nigerian, OFAC, and EU sanctions lists at onboarding and periodically. Positive matches trigger automatic suspension and MLRO escalation.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">7. Record Keeping</h2>
            <p className="text-muted-foreground">KYC, transaction, and investigation records retained ≥ 5 years from transaction date or relationship termination, whichever is later.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">8. Training & Governance</h2>
            <p className="text-muted-foreground">Mandatory AML/CFT training for all staff at onboarding and annually. The MLRO reports directly to the Chief Compliance Officer and Board Risk Committee. Independent annual audit conducted.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">9. Whistleblowing</h2>
            <p className="text-muted-foreground">Suspected breaches may be reported confidentially to <a href="mailto:compliance@vestara.ng" className="text-primary underline">compliance@vestara.ng</a>. Vestara guarantees protection from retaliation.</p>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-base font-semibold text-foreground">Contact</h3>
            <p className="text-muted-foreground">Compliance Officer: compliance@vestara.ng</p>
            <p className="text-muted-foreground">Phone: 09039479554 • Lagos, Nigeria • vestara.ng</p>
          </div>
        </section>
      </main>
    </div>
  );
}
