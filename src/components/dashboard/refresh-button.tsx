"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={() => {
        setBusy(true);
        router.refresh();
        setTimeout(() => setBusy(false), 800);
      }}
    >
      <RefreshCw size={13} />
      Refresh
    </Button>
  );
}
