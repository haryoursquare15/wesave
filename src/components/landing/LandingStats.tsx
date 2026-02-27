import { motion } from "framer-motion";

const stats = [
  { value: "10,000+", label: "Active Users" },
  { value: "₦500M+", label: "Total Savings" },
  { value: "2,000+", label: "Groups Created" },
  { value: "100%", label: "Payout Success" },
];

export function LandingStats() {
  return (
    <section className="py-16 bg-gradient-to-r from-primary to-primary/80">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-bold text-primary-foreground mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-primary-foreground/70">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
