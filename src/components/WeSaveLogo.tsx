import { Link } from "react-router-dom";
import wesaveLogo from "@/assets/wesave-logo-new.png";

interface WeSaveLogoProps {
  className?: string;
  showTagline?: boolean;
  linkTo?: string;
}

export function WeSaveLogo({ className = "h-10", showTagline = false, linkTo }: WeSaveLogoProps) {
  const content = (
    <div className="flex items-center gap-2">
      <img src={wesaveLogo} alt="WeSave" className={className} />
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
