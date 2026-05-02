import { Link } from "wouter";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4" data-testid="not-found-page">
      <Shield className="w-12 h-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold font-mono text-foreground">404 — NOT FOUND</h1>
      <p className="text-muted-foreground font-mono text-sm">This receipt does not exist in the chain.</p>
      <Link href="/">
        <Button variant="outline" className="font-mono text-xs" data-testid="link-go-home">RETURN TO DASHBOARD</Button>
      </Link>
    </div>
  );
}
