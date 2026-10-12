import { Link } from "react-router-dom";
import wesaveLogoUrl from "@/assets/vestara-logo-transparent.png";
const wesaveLogo = { url: wesaveLogoUrl };

interface VestaraLogoProps {
  className?: string;
  showTagline?: boolean;
  linkTo?: string;
}

export function VestaraLogo({ className = "h-10", showTagline = false, linkTo }: VestaraLogoProps) {
  const content = (
    <div className="flex items-center gap-2">
      <img src={wesaveLogo.url} alt="Vestara" className={className} />
      {showTagline && (
        <span className="text-sm text-muted-foreground">Transparency & control</span>
      )}
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>;
  }

  return content;
}
