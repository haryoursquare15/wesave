import { ArrowLeft, UserCheck, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function KycPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-8">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">KYC Onboarding Policy</h1>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/compliance/Vestara_KYC_Onboarding_Policy_v1.1.docx" download>
              <Download className="h-4 w-4 mr-2" /> DOCX
            </a>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center gap-2 mb-4 text-primary">
          <UserCheck className="h-5 w-5" />
          <span className="text-sm font-medium">Effective: April 2026 • Version 1.1</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">VESTARA — KYC ONBOARDING POLICY</h1>
        <p className="text-muted-foreground mb-6">Operated by LLH Premium Enterprise on vestara.ng. Identity, BVN, NIN, and account verification powered exclusively by VFD Microfinance Bank Plc (BaaS). Aligned with the CBN 3-Tier KYC framework, MLPPA 2022, and NDPA 2023.</p>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">1. Principles</h2>
            <p className="text-muted-foreground">Identify, verify, apply proportionate due diligence, and maintain continuous KYC. Sensitive identifiers are encrypted at rest (AES-256) and in transit (TLS 1.3).</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">2. Onboarding Workflow</h2>
            <ul className="text-muted-foreground list-disc pl-5 space-y-1">
              <li>Verified email and Nigerian mobile number.</li>
              <li>BVN match against name and date of birth via NIBSS.</li>
              <li>NIN verification via NIMC where required.</li>
              <li>Selfie with liveness detection for Tier-2+ activations.</li>
              <li>Bank account name must match BVN-registered name; penny-drop validation before first withdrawal.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">3. KYC Tiers</h2>
            <ul className="text-muted-foreground list-disc pl-5 space-y-1">
              <li><strong>Tier 1:</strong> phone + email — ₦50k daily / ₦300k cumulative.</li>
              <li><strong>Tier 2:</strong> BVN + ID — ₦200k daily / ₦500k cumulative.</li>
              <li><strong>Tier 3:</strong> proof of address + source of funds — higher limits with EDD.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">4. Enhanced Due Diligence</h2>
            <p className="text-muted-foreground">Required for PEPs, FATF high-risk jurisdictions, transactions above ₦5M, and association admins of large groups (&gt; 20 members). Senior management sign-off required.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">5. Group, Association & Crowdfunding KYC</h2>
            <ul className="text-muted-foreground list-disc pl-5 space-y-1">
              <li>Association admins undergo Tier-3 verification including IDs of all executives.</li>
              <li>Associations must upload a member signature register, a formal request letter on association letterhead, and IDs of executives before approval.</li>
              <li>Crowdfunding owners must verify the beneficiary bank account and attest to the purpose of funds.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">6. Ongoing Maintenance</h2>
            <p className="text-muted-foreground">KYC refreshed every 24 months (Tier 1), 18 months (Tier 2), 12 months (Tier 3 / High-Risk), or upon trigger events (limit upgrade, sanctions hit, adverse media).</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">7. Customer Rights</h2>
            <ul className="text-muted-foreground list-disc pl-5 space-y-1">
              <li>Right of access, rectification, and portability of personal data.</li>
              <li>Right to lodge complaints with the Nigeria Data Protection Commission (NDPC).</li>
              <li>Right to be notified before account termination where lawful.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">8. Refusal & Termination</h2>
            <p className="text-muted-foreground">Vestara may decline onboarding or terminate relationships where KYC requirements cannot be satisfied or where false information is detected.</p>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-base font-semibold text-foreground">Contact</h3>
            <p className="text-muted-foreground">KYC Desk: kyc@vestara.ng • DPO: dpo@vestara.ng</p>
            <p className="text-muted-foreground">Phone: 09039479554 • Lagos, Nigeria • vestara.ng</p>
          </div>
        </section>
      </main>
    </div>
  );
}
