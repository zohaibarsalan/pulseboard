import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Key, Save, Trash2, X } from "lucide-react";
import { api, type SecretInfo } from "../lib/api.js";
import { SourceBadge } from "./SourceBadge.js";
import { cn } from "../lib/cn.js";

export function SecretsManager(): React.ReactElement {
  const { data } = useQuery({ queryKey: ["secrets"], queryFn: api.secrets });

  return (
    <div className="space-y-1.5">
      <p className="mb-3 text-xs text-fg-subtle">
        Add the signing secret for each provider you want Studio to verify. Secrets are stored
        locally in your SQLite database and never leave your machine.
      </p>
      {data?.secrets.map((s) => <SecretRow key={s.source} info={s} />)}
    </div>
  );
}

function SecretRow({ info }: { info: SecretInfo }): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: () => api.setSecret(info.source, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["secrets"] });
      setEditing(false);
      setValue("");
      setReveal(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteSecret(info.source),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["secrets"] });
    },
  });

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-bg-muted/20 px-3 py-2">
      <div className="w-24 shrink-0">
        <SourceBadge source={info.source} />
      </div>

      {editing ? (
        <>
          <input
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste signing secret…"
            autoFocus
            className="flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-fg"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="text-fg-subtle hover:text-fg"
            title={reveal ? "Hide" : "Show"}
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!value || save.isPending}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-bg",
              (!value || save.isPending) && "opacity-50",
            )}
          >
            {save.isSuccess ? <Check className="h-3 w-3 text-success" /> : <Save className="h-3 w-3" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setValue("");
            }}
            className="text-fg-subtle hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            {info.configured ? (
              <code className="font-mono text-xs text-fg">{info.masked}</code>
            ) : (
              <span className="text-xs text-fg-subtle">Not configured</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-bg-muted"
          >
            <Key className="h-3 w-3" />
            {info.configured ? "Update" : "Add secret"}
          </button>
          {info.configured && (
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="text-fg-subtle hover:text-danger"
              title="Remove secret"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
