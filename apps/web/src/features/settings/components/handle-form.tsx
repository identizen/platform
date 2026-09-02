import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Label } from '@identizen/ui';

export const HandleFormSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'At least 3 characters')
    .max(32, 'At most 32 characters')
    .regex(
      /^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/,
      'Letters, numbers, . _ - ; must start and end with a letter or number',
    ),
});

export type HandleFormValues = z.infer<typeof HandleFormSchema>;

export interface HandleFormProps {
  current: string | null;
  busy: boolean;
  error: string | null;
  onSave: (handle: string) => void;
  onClear: () => void;
}

/** Presentational: RHF + Zod form for the optional human handle. */
export function HandleForm({ current, busy, error, onSave, onClear }: HandleFormProps) {
  const form = useForm<HandleFormValues>({
    resolver: zodResolver(HandleFormSchema),
    defaultValues: { handle: current ?? '' },
    mode: 'onBlur',
  });
  const fieldError = form.formState.errors.handle?.message;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => void form.handleSubmit((v) => onSave(v.handle))(e)}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input
          id="handle"
          placeholder="george"
          autoComplete="off"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby="handle-help handle-error"
          {...form.register('handle')}
        />
        <p id="handle-help" className="text-xs text-fg-muted">
          Optional. Lets sites you allow show a name instead of an opaque id. Never required.
        </p>
        <p id="handle-error" role="alert" className="min-h-4 text-xs text-danger-soft-fg">
          {fieldError ?? error ?? ''}
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save handle'}
        </Button>
        {current ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onClear}>
            Remove handle
          </Button>
        ) : null}
      </div>
    </form>
  );
}
