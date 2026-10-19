import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Menu, ShieldCheck, TrendingUp, Users, X, Wallet, Target, Landmark, ReceiptText, ArrowLeft } from "lucide-react";
import logo from "@/assets/vestara-logo-transparent.png";

const imagery = {
  people: "https://images.pexels.com/photos/30678206/pexels-photo-30678206.jpeg?auto=compress&cs=tinysrgb&w=1800",
  save: "https://images.pexels.com/photos/30677594/pexels-photo-30677594.jpeg?auto=compress&cs=tinysrgb&w=1800",
  community: "https://images.pexels.com/photos/17272256/pexels-photo-17272256.jpeg?auto=compress&cs=tinysrgb&w=1800",
  moments: "https://images.pexels.com/photos/30677716/pexels-photo-30677716.jpeg?auto=compress&cs=tinysrgb&w=1600",
};
function onPhotoError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  const localFallback = image.dataset.fallback || "/illustrations/community.svg";
  // Do not retry another remote host. The illustration is bundled in the app,
  // renders offline and guarantees that the card will never become a blank block.
  if (image.dataset.fallbackApplied === "yes") return;
  image.dataset.fallbackApplied = "yes";
  image.src = localFallback;
}

const slides = [
  { tag: "SPLIT PAY", first: "Better", emphasis: "together.", description: "Dinner with friends. Shared plans. Everyday bills. Split the cost, not the connection.", photo: imagery.people, alt: "Nigerian friends enjoying a moment with a phone at a restaurant", position: "center 44%" },
  { tag: "SMART SAVINGS", first: "Make room", emphasis: "for more.", description: "Small steps can lead somewhere big. Save for what matters at a pace that feels like yours.", photo: imagery.save, alt: "Smiling Nigerian woman using a smartphone in Lagos", position: "center 42%" },
  { tag: "AJO & ESUSU", first: "Grow with", emphasis: "your people.", description: "The familiar power of saving together, thoughtfully reimagined for a digital world.", photo: imagery.community, alt: "Nigerian professionals collaborating in an office in Lagos", position: "center 48%" },
];
const offerings = [
  { number: "01", tag: "FOR THE MOMENTS WE SHARE", title: "Split Pay", description: "Create a bill, invite your people, and see contributions clearly. More moments together, less back and forth.", photo: imagery.people, alt: "Nigerian friends gathered around a phone", icon: CreditCard, link: "Split expenses with ease" },
  { number: "02", tag: "FOR THE PLANS THAT MATTER", title: "Smart savings", description: "From a rainy-day buffer to a bigger next step, make steady progress towards what matters to you.", photo: imagery.save, alt: "Young Nigerian woman using a smartphone", icon: TrendingUp, link: "Make your money intentional" },
  { number: "03", tag: "ROOTED IN TOGETHERNESS", title: "Ajo & Esusu", description: "Bring your circle together with a shared view of contributions and the journey ahead.", photo: imagery.community, alt: "Nigerian professionals working together", icon: Users, link: "Grow with your circle" },
];
const features = [
  { number: "01", icon: Wallet, eyebrow: "YOUR EVERYDAY MONEY", title: "A wallet for daily life", description: "Keep the important things together with a clear view of your money." },
  { number: "02", icon: Target, eyebrow: "MAKE IT HAPPEN", title: "Savings with purpose", description: "Create a plan for what matters, and watch your progress unfold." },
  { number: "03", icon: Users, eyebrow: "BETTER AS A CIRCLE", title: "Ajo, made modern", description: "Bring the familiar power of community savings into a simpler digital experience." },
  { number: "04", icon: ReceiptText, eyebrow: "ONE LESS TASK", title: "Everyday bill payments", description: "Stay on top of bills and keep your payment activity easy to review." },
  { number: "05", icon: Landmark, eyebrow: "MONEY IN MOTION", title: "Bank transfers", description: "Move your money and follow your transactions from one place." },
  { number: "06", icon: ShieldCheck, eyebrow: "CONFIDENCE FIRST", title: "Security settings", description: "Take charge of your account protection and payments." },
];

const principles = [
  { n: "01", title: "Money, in one place.", body: "Save, pay and manage shared contributions without juggling multiple platforms." },
  { n: "02", title: "Clarity from day one.", body: "See your activity, follow your plan and know what your next step looks like." },
  { n: "03", title: "Made for real life.", body: "A personal goal or a group ambition. Take the next step in a way that works for you." },
];
const reveal = { initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.15 }, transition: { duration: 0.75, ease: "easeOut" as const } };

export default function VestaraLanding() {
  const [slide, setSlide] = useState(0);
  const [pause, setPause] = useState(false);
  const [menu, setMenu] = useState(false);
  const productRail = useRef<HTMLDivElement>(null);
  const featureRail = useRef<HTMLDivElement>(null);
  const [railEdges, setRailEdges] = useState({
    products: { start: true, end: false, page: 1, total: offerings.length },
    features: { start: true, end: false, page: 1, total: features.length },
  });
  const reduced = useReducedMotion();
  const current = slides[slide];

  useEffect(() => {
    document.title = "Vestara | Money moves better together";
    const description = "Vestara brings Split Pay, smart savings, and Ajo and Esusu circles together in a modern Nigerian money app.";
    const meta = document.querySelector('meta[name="description"]') || document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", description);
    if (!meta.parentElement) document.head.appendChild(meta);
    const theme = document.querySelector('meta[name="theme-color"]') || document.createElement("meta");
    theme.setAttribute("name", "theme-color");
    theme.setAttribute("content", "#0c2336");
    if (!theme.parentElement) document.head.appendChild(theme);
  }, []);

  useEffect(() => {
    if (pause || reduced) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setSlide(s => (s + 1) % slides.length);
    }, 7200);
    return () => window.clearInterval(timer);
  }, [pause, reduced, slide]);

  const navigateSlide = (offset: number) => setSlide((s) => (s + offset + slides.length) % slides.length);
  const refreshRail = (kind: "products" | "features") => {
    const rail = kind === "products" ? productRail.current : featureRail.current;
    if (!rail) return;
    const first = rail.querySelector<HTMLElement>("article");
    const width = (first?.getBoundingClientRect().width || rail.clientWidth * .8) + 20;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const next = {
      start: rail.scrollLeft <= 5,
      end: rail.scrollLeft >= maxScroll - 5,
      page: Math.min(kind === "products" ? offerings.length : features.length, 1 + Math.round(rail.scrollLeft / Math.max(1, width))),
      total: kind === "products" ? offerings.length : features.length,
    };
    setRailEdges(old => {
      const previous = old[kind];
      if (previous.start === next.start && previous.end === next.end && previous.page === next.page) return old;
      return {...old, [kind]: next};
    });
  };
  useEffect(() => {
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      refreshRail("products");
      refreshRail("features");
    }) : null;
    if (productRail.current) observer?.observe(productRail.current);
    if (featureRail.current) observer?.observe(featureRail.current);
    const frame = requestAnimationFrame(() => {refreshRail("products"); refreshRail("features");});
    return () => {observer?.disconnect(); cancelAnimationFrame(frame);};
  }, []);
  const moveRail = (ref: { current: HTMLDivElement | null }, direction: number) => {
    const rail = ref.current;
    if (!rail) return;
    const kind = ref === productRail ? "products" : "features";
    const edges = railEdges[kind];
    if ((direction < 0 && edges.start) || (direction > 0 && edges.end)) return;
    const firstCard = rail.querySelector<HTMLElement>("article");
    const distance = (firstCard?.getBoundingClientRect().width ?? rail.clientWidth * 0.8) + 20;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    rail.scrollTo({left: Math.max(0, Math.min(max, rail.scrollLeft + distance * direction)),behavior: reduced ? "auto" : "smooth"});
  };

  return <div className="vc-site">
    <a href="#content" className="vc-skip">Skip to content</a>
    <header className="vc-hero" id="top" onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}>
      <div className="vc-hero-background" aria-hidden="true">
        <AnimatePresence initial={false} mode="sync">
          <motion.img
            key={current.photo}
            src={current.photo}
            alt=""
            onError={onPhotoError}
            referrerPolicy="no-referrer"
            style={{ objectPosition: current.position }}
            className="vc-hero-photo"
            data-fallback={slide === 0 ? "/illustrations/split.svg" : slide === 1 ? "/illustrations/savings.svg" : "/illustrations/community.svg"}
            initial={{ opacity: 0, scale: 1.065 }}
            animate={{ opacity: 1, scale: reduced ? 1 : 1.005 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: reduced ? 0 : 1.3 }, scale: { duration: 8, ease: "linear" } }}
          />
        </AnimatePresence>
        <div className="vc-hero-overlay" />
      </div>
      <nav className="vc-nav" aria-label="Main">
        <a href="/" className="vc-logo" aria-label="Vestara home"><img src={logo} alt="Vestara" className="vc-logo-art" /><img src={logo} alt="" aria-hidden="true" className="vc-logo-white-text" /></a>
        <div className="vc-nav-menu"><a href="#why-vestara">Our approach</a><a href="#products">Our services</a><a href="#how-it-works">How it works</a></div>
        <div className="vc-nav-right"><a href="/signin" className="vc-signin">Sign in</a><a href="/signin?mode=signup" className="vc-nav-join">Get started <ArrowUpRight size={16}/></a></div>
        <button className="vc-menu-button" type="button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(o => !o)}>{menu ? <X size={23}/> : <Menu size={23}/>}</button>
      </nav>
      {menu && <div className="vc-mobile-menu">
        <a href="#why-vestara" onClick={() => setMenu(false)}>Our approach</a>
        <a href="#products" onClick={() => setMenu(false)}>Our services</a>
        <a href="#how-it-works" onClick={() => setMenu(false)}>How it works</a>
        <a href="/signin" onClick={() => setMenu(false)}>Sign in</a>
        <a href="/signin?mode=signup" onClick={() => setMenu(false)}>Create account <ArrowUpRight size={17}/></a>
      </div>}
      <div className="vc-hero-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={slide} className="vc-hero-copy" initial={{ opacity: 0, y: reduced ? 0 : 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -16 }} transition={{ duration: reduced ? 0 : .7, ease: [0.2, 1, 0.2, 1] }}>
            
            <h1>{current.first}<br/><em>{current.emphasis}</em></h1>
            <p>{current.description}</p>
            <div className="vc-hero-buttons"><a href="/signin?mode=signup" className="vc-primary-link">Start with Vestara <ArrowUpRight size={19}/></a><a href="#products" className="vc-quiet-link">Explore Vestara <ArrowDown size={17}/></a></div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="vc-hero-bottom">
        <div className="vc-hero-signature"><span className="vc-hero-dot"/><span>MADE FOR YOUR MONEY<br/><b>Made for your life.</b></span></div>
        <div className="vc-slide-list">
          {slides.map((item,i) => <button type="button" key={item.tag} onClick={() => setSlide(i)} className={"vc-slide-button " + (i === slide ? "active" : "")} aria-label={"Show " + item.tag} aria-current={i === slide ? "true" : undefined}>
            <span className="vc-slide-line"><span className={i === slide ? (pause || reduced ? "complete" : "animate") : ""}/></span>
            <span className="vc-slide-text">0{i+1}<b>{item.tag}</b></span>
          </button>)}
        </div>
        <div className="vc-slider-arrows"><button onClick={() => navigateSlide(-1)} aria-label="Previous story"><ChevronLeft size={19}/></button><button onClick={() => navigateSlide(1)} aria-label="Next story"><ChevronRight size={19}/></button></div>
      </div>
      <span className="vc-hero-aside">FINANCES, WITH FEELING.</span>
    </header>
    <main id="content">
      <section className="vc-intro vc-wrap" id="why-vestara">
        <motion.div {...reveal} className="vc-intro-head">
          <span className="vc-kicker"><i/>THE VESTARA WAY</span>
          <h2>Money is personal.<br/><em>Progress is shared.</em></h2>
          <p>Real life is full of moments worth showing up for. A dinner, a dream, a new beginning. We make the money side feel lighter.</p>
        </motion.div>
        <div className="vc-intro-grid">
          <motion.div {...reveal} className="vc-intro-image"><img src={imagery.moments} alt="Friends enjoying a shared moment" loading="lazy" onError={onPhotoError} data-fallback="/illustrations/split.svg" referrerPolicy="no-referrer"/><span>COMMUNITY<br/>IS CURRENCY.</span></motion.div>
          <motion.div {...reveal} className="vc-intro-dark"><span>01 / 03</span><div><span className="vc-kicker vc-kicker-light">YOUR LIFE. YOUR PACE.</span><h3>Built for the way<br/><em>we really live.</em></h3><p>Modern financial tools should feel human. Whether you are planning alone or bringing your people along, clarity makes all the difference.</p><a href="#products" className="vc-outline-link">Explore our services <ArrowUpRight size={19}/></a></div></motion.div>
        </div>
      </section>

      <section className="vc-products vc-wrap vc-carousel-section" id="products">
        <motion.div {...reveal} className="vc-products-header vc-rail-heading">
          <div><span className="vc-kicker vc-kicker-light"><i/> BUILT AROUND YOU</span><h2>Vestara <em>products.</em></h2><p className="vc-rail-subtitle">Made for your plans, your everyday moments and your people.</p></div>
          <div className="vc-rail-actions"><span>{String(railEdges.products.page).padStart(2,"0")} / {String(railEdges.products.total).padStart(2,"0")} <ArrowRight size={14}/></span><button type="button" disabled={railEdges.products.start} aria-label="Previous product" onClick={() => moveRail(productRail,-1)}><ArrowLeft size={20}/></button><button type="button" disabled={railEdges.products.end} aria-label="Next product" onClick={() => moveRail(productRail,1)}><ArrowRight size={20}/></button></div>
        </motion.div>
        <div className="vc-offerings vc-swipe-rail" ref={productRail} onScroll={() => refreshRail("products")} role="region" aria-label="Vestara products, swipe to explore" tabIndex={0}>
          {offerings.map((item,i) => <motion.article key={item.title} className={"vc-offering vc-floating-product vc-offering-"+i} initial={{opacity:0,y:42,scale:.96}} whileInView={{opacity:1,y:0,scale:1}} viewport={{once:true,amount:.12}} transition={{duration:.65,delay:i*.08,ease:"easeOut"}}>
            <img src={item.photo} loading="lazy" alt={item.alt} onError={onPhotoError} data-fallback={i === 0 ? "/illustrations/split.svg" : i === 1 ? "/illustrations/savings.svg" : "/illustrations/community.svg"} referrerPolicy="no-referrer"/><div className="vc-offering-overlay"/>
            <div className="vc-offering-inside"><div className="vc-offering-top"><span>{item.number} / VESTARA</span><item.icon size={23} strokeWidth={1.6}/></div><div><span className="vc-overline">{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p><a href="/signin?mode=signup"><span>{item.link}</span><span className="vc-offering-arrow"><ArrowUpRight size={19}/></span></a></div></div>
          </motion.article>)}
        </div>
        <p className="vc-swipe-hint"><span/> SWIPE TO DISCOVER THE VESTARA WAY <ArrowRight size={16}/></p>
      </section>
      <section className="vc-features vc-wrap vc-carousel-section" id="features">
        <motion.div {...reveal} className="vc-feature-heading vc-rail-heading">
          <div><span className="vc-kicker"><i/> ALL IN ONE PLACE</span><h2>Everything you need <em>to grow your money.</em></h2><p className="vc-rail-subtitle">Everyday tools to help your money move with purpose.</p></div>
          <div className="vc-rail-actions"><span>{String(railEdges.features.page).padStart(2,"0")} / {String(railEdges.features.total).padStart(2,"0")} <ArrowRight size={14}/></span><button type="button" disabled={railEdges.features.start} aria-label="Previous feature" onClick={() => moveRail(featureRail,-1)}><ArrowLeft size={20}/></button><button type="button" disabled={railEdges.features.end} aria-label="Next feature" onClick={() => moveRail(featureRail,1)}><ArrowRight size={20}/></button></div>
        </motion.div>
        <div className="vc-feature-rail vc-swipe-rail" ref={featureRail} onScroll={() => refreshRail("features")} role="region" aria-label="Everything you need to grow your money, swipe to explore" tabIndex={0}>
          {features.map((f,i) => <motion.article key={f.title} className={"vc-feature-card vc-feature-"+i} initial={{opacity:0,y:48,rotate:i%2===0?-2:2}} whileInView={{opacity:1,y:0,rotate:0}} viewport={{once:true,amount:.14}} transition={{duration:.65,delay:(i%3)*.06,ease:"easeOut"}}>
            <div className="vc-feature-top"><span>{f.number} / 06</span><span className="vc-feature-icon"><f.icon size={26} strokeWidth={1.65}/></span></div>
            <div><span className="vc-feature-eyebrow">{f.eyebrow}</span><h3>{f.title}</h3><p>{f.description}</p></div>
            <a href="/signin?mode=signup" aria-label={"Get started with "+f.title}>Discover more <ArrowUpRight size={18}/></a>
          </motion.article>)}
        </div>
      </section>
      <section className="vc-how vc-wrap" id="how-it-works">
        <motion.div {...reveal} className="vc-how-top"><span className="vc-kicker"><i/>EVERYDAY PROGRESS</span><h2>Beautifully simple.<br/><em>Purposefully yours.</em></h2><p>Good financial decisions should feel straightforward. Take your next step with a clearer picture.</p></motion.div>
        <div className="vc-how-list">{principles.map(item=><motion.div {...reveal} className="vc-how-row" key={item.n}><span>{item.n}</span><h3>{item.title}</h3><p>{item.body}</p><CheckCircle2 size={23} strokeWidth={1.3}/></motion.div>)}</div>
        <motion.div {...reveal} className="vc-trust"><div><ShieldCheck size={25}/></div><p><b>Clarity is a feature.</b><br/>Review product terms and conditions before you make a financial commitment. Banking services are supported through VFD Microfinance Bank.</p><a href="/terms">Read the terms <ArrowUpRight size={16}/></a></motion.div>
      </section>
      <section className="vc-end"><img src={imagery.community} loading="lazy" alt="" onError={onPhotoError} data-fallback="/illustrations/community.svg" referrerPolicy="no-referrer"/><div className="vc-end-overlay"/><motion.div {...reveal}><span className="vc-kicker vc-kicker-light"><i/>YOUR NEXT CHAPTER</span><h2>The future looks<br/><em>good on you.</em></h2><p>Make space for bigger plans, everyday wins and everything in between.</p><a href="/signin?mode=signup" className="vc-primary-link">Create your account <ArrowUpRight size={19}/></a></motion.div></section>
    </main>
    <footer className="vc-footer vc-footer-light"><div className="vc-footer-main"><a href="/" className="vc-logo" aria-label="Vestara home"><img src={logo} alt="Vestara" className="vc-logo-art" /></a><p>Your money. Your people. Your next chapter.</p><a href="#top">Back to top <ArrowUpRight size={17}/></a></div><div className="vc-footer-small"><span>© {new Date().getFullYear()} Vestara. All rights reserved.</span><div><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/kyc-policy">KYC</a><a href="/aml-policy">AML</a><a href="/signin">Sign in</a></div><span>Powered and supported by VFD Microfinance Bank.</span></div></footer>
  </div>;
}
