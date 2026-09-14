"use client";
import keycloak from "@/auth/keycloak";

import { useState, useTransition } from "react";
import { generateSystemCard } from "./actions";

export default function GenerateCardButton({
  qualificationId,
  hasCard,
}: {
  qualificationId: string;
  hasCard: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await generateSystemCard(qualificationId, keycloak.token);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="qf-card-actions">
      <button
        type="button"
        className="btn"
        onClick={onClick}
        disabled={pending}
      >
        {pending
          ? "Generating..."
          : hasCard
            ? "Regenerate system card"
            : "Generate system card"}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
