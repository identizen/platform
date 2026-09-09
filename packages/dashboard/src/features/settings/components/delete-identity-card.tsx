import { useId, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from '@identizen/ui';
import type { DeleteReason } from '../api/delete-identity';

export interface DeleteIdentityCardProps {
  busy: boolean;
  error: string | null;
  onDelete: (reason: DeleteReason) => void;
}

/** The word the person types to confirm; a click alone is too easy for something this final. */
export const DELETE_CONFIRMATION = 'delete';

/**
 * Presentational: deleting the identity and everything the index holds about it. The
 * confirmation word gates the button; the switch marks a leaked recovery phrase, which also
 * blocks that phrase from ever enrolling again.
 */
export function DeleteIdentityCard({ busy, error, onDelete }: DeleteIdentityCardProps) {
  const [typed, setTyped] = useState('');
  const [compromised, setCompromised] = useState(false);
  const inputId = useId();
  const switchId = useId();
  const ready = typed.trim().toLowerCase() === DELETE_CONFIRMATION && !busy;
  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle>Delete my identity</CardTitle>
        <CardDescription>
          Removes this identity and everything the index holds about it: devices, paired browsers,
          sessions, per-site identifiers and the audit trail. Every site where you are signed in is
          told to end that session. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-3">
          <Switch
            id={switchId}
            checked={compromised}
            onCheckedChange={setCompromised}
            disabled={busy}
          />
          <Label htmlFor={switchId}>
            My recovery phrase was compromised (the same phrase can never be enrolled again)
          </Label>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>Type &quot;{DELETE_CONFIRMATION}&quot; to confirm</Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <Button
            variant="destructive"
            disabled={!ready}
            onClick={() => onDelete(compromised ? 'compromised' : 'deleted')}
          >
            {busy ? 'Deleting…' : 'Delete my identity'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
