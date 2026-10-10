import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Paths } from "@contracts/constants";

function getMicrosoftLoginUrl(): string {
  const redirectTo = new URLSearchParams(window.location.search).get("redirect_to") || "/";
  const url = new URL(Paths.microsoftLogin, window.location.origin);
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>DDCost — Accesso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Accesso riservato al personale autorizzato DIDIEFFE GROUP SRL
          </p>
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              window.location.href = getMicrosoftLoginUrl();
            }}
          >
            Accedi con Microsoft 365
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
