// Shared micro-interaction presets: transform/opacity only, fast and calm.
export const spring = { type: "spring" as const, stiffness: 400, damping: 30 };
export const easeOut = { duration: 0.2, ease: "easeOut" as const };
export const press = { scale: 0.96 };

export const shake = { x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.3 } };

export const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
export const listItem = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: easeOut },
};
