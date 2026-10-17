import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function LandingCTA() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-10 md:p-16 text-center"
        >
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary-foreground" />
            <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-primary-foreground" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to Start Your Thrift Journey?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              Join thousands of Africans saving smarter together. Create your account
              in minutes and start building your financial future.
            </p>
            <Link to="/signin?mode=signup">
              <Button variant="gold" size="xl">
                Get Started for Free
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
