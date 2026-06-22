import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "What is Vestara?",
    answer:
      "Vestara is a digital platform for Ajo/Esusu — the traditional African rotating savings scheme. We bring it online with automated payments, trust ratings, and full transparency.",
  },
  {
    question: "Is my money safe?",
    answer:
      "Yes. All transactions are powered by Flutterwave, a licensed payment processor. Funds are held in dedicated accounts, and every contribution is tracked on-chain in our ledger.",
  },
  {
    question: "How does the payout work?",
    answer:
      "Each cycle, one member receives the full pot (minus a small platform fee). The order is set when the group starts — either chosen by the admin or randomized.",
  },
  {
    question: "What happens if someone doesn't contribute?",
    answer:
      "Defaulters' trust scores drop, affecting their ability to join future groups. Groups can also enable auto-debit to prevent missed payments entirely.",
  },
  {
    question: "What fees does Vestara charge?",
    answer:
      "Vestara charges a small percentage fee only on payouts. There are no hidden charges — contributions, wallet funding, and group creation are free.",
  },
  {
    question: "Can I create a private group?",
    answer:
      "Yes! You can create invite-only groups and share a unique invite link with the people you want to join.",
  },
];

export function LandingFAQ() {
  return (
    <section className="py-20 bg-background" id="faq">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">FAQ</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Frequently Asked Questions
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`faq-${index}`}
                className="border border-border rounded-xl px-5 data-[state=open]:bg-card"
              >
                <AccordionTrigger className="text-left font-medium text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
