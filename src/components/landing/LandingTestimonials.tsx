import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Chioma A.",
    role: "Lagos, Nigeria",
    quote: "Vestara helped me save ₦500,000 for my shop renovation. The auto-debit feature made it effortless!",
    rating: 5,
  },
  {
    name: "Emeka O.",
    role: "Abuja, Nigeria",
    quote: "I love the transparency — every contribution and payout is tracked. No more 'my money is missing' stories.",
    rating: 5,
  },
  {
    name: "Fatima B.",
    role: "Kano, Nigeria",
    quote: "My women's group has been using Vestara for 6 months. The trust rating system keeps everyone accountable.",
    rating: 5,
  },
];

export function LandingTestimonials() {
  return (
    <section className="py-20 bg-card" id="testimonials">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">Testimonials</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            What Our Users Say
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Thousands of Nigerians trust Vestara to manage their rotating savings.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-6 rounded-2xl bg-background border border-border"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-gold text-gold" />
                ))}
              </div>
              <p className="text-foreground mb-4 text-sm leading-relaxed italic">
                "{testimonial.quote}"
              </p>
              <div>
                <div className="font-semibold text-foreground text-sm">{testimonial.name}</div>
                <div className="text-muted-foreground text-xs">{testimonial.role}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
