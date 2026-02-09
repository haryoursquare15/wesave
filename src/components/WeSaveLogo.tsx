import wesaveLogo from "@/assets/wesave-logo.jpg";

interface WeSaveLogoProps {
  className?: string;
  showTagline?: boolean;
}

export function WeSaveLogo({ className = "h-10", showTagline = false }: WeSaveLogoProps) {
  return (
    <div className="flex items-center gap-2">
      <img src={wesaveLogo} alt="WeSave" className={className} />
      {showTagline && (
        <span className="text-sm text-muted-foreground">Transparency & control</span>
      )}
    </div>
  );
}
