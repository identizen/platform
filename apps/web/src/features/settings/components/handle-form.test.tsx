import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HandleForm, HandleFormSchema } from './handle-form';

describe('HandleForm', () => {
  it('validates against the handle rules and submits lower-cased', async () => {
    const onSave = vi.fn();
    render(
      <HandleForm current={null} busy={false} error={null} onSave={onSave} onClear={vi.fn()} />,
    );
    const input = screen.getByLabelText('Handle');
    await userEvent.type(input, 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Save handle' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('At least 3 characters'),
    );
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, '-bad-');
    await userEvent.click(screen.getByRole('button', { name: 'Save handle' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/must start and end/));

    await userEvent.clear(input);
    await userEvent.type(input, 'George.R');
    await userEvent.click(screen.getByRole('button', { name: 'Save handle' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('george.r'));
    expect(screen.queryByRole('button', { name: 'Remove handle' })).not.toBeInTheDocument();
  });

  it('offers removal when a handle exists and shows server errors', async () => {
    const onClear = vi.fn();
    render(
      <HandleForm
        current="george"
        busy={false}
        error="handle already taken"
        onSave={vi.fn()}
        onClear={onClear}
      />,
    );
    expect(screen.getByLabelText('Handle')).toHaveValue('george');
    expect(screen.getByRole('alert')).toHaveTextContent('handle already taken');
    await userEvent.click(screen.getByRole('button', { name: 'Remove handle' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('schema matches the index HandleSchema', () => {
    expect(HandleFormSchema.safeParse({ handle: 'a'.repeat(33) }).success).toBe(false);
    expect(HandleFormSchema.safeParse({ handle: 'ok_1' }).success).toBe(true);
    expect(HandleFormSchema.safeParse({ handle: 'no space' }).success).toBe(false);
  });
});
