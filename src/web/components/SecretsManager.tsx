import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Key, Save, Trash2, X } from "lucide-react";
import { api, type SecretInfo } from "../lib/api.js";
import { SourceBadge } from "./SourceBadge.js";
import { Button, Input } from "./coss-ui/index.js";

export function SecretsManager(): React.ReactElement {
  const { data } = useQuery({ queryKey: ["secrets"], queryFn: api.secrets });

  return (
    <div className="space-y-1.5">
      <p className="mb-3 text-xs text-fg-subtle">
        Add the signing secret for each provider you want Pulseboard to verify. Secrets are stored
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
          <Input
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste signing secret…"
            autoFocus
            className="flex-1 font-mono text-xs"
          />
          <Button
            onClick={() => setReveal((v) => !v)}
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={reveal ? "Hide" : "Show"}
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!value || save.isPending}
            size="sm"
          >
            {save.isSuccess ? <Check className="h-3 w-3 text-success" /> : <Save className="h-3 w-3" />}
            Save
          </Button>
          <Button
            onClick={() => {
              setEditing(false);
              setValue("");
            }}
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Cancel editing secret"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
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
          <Button
            onClick={() => setEditing(true)}
            size="sm"
          >
            <Key className="h-3 w-3" />
            {info.configured ? "Update" : "Add secret"}
          </Button>
          {info.configured && (
            <Button
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              variant="danger"
              size="icon"
              className="h-7 w-7"
              title="Remove secret"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
