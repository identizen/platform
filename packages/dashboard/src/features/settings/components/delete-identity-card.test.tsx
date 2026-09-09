import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteIdentityCard } from './delete-identity-card';

describe('DeleteIdentityCard', () => {
  it('needs the confirmation word, and reports a compromised phrase as such', async () => {
    const onDelete = vi.fn();
    render(<DeleteIdentityCard busy={false} error={null} onDelete={onDelete} />);
    const button = screen.getByRole('button', { name: 'Delete my identity' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type "delete" to confirm'), 'DELETE');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onDelete).toHaveBeenLastCalledWith('deleted');
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(button);
    expect(onDelete).toHaveBeenLastCalledWith('compromised');
  });

  it('shows the error and stays disabled while busy', () => {
    render(<DeleteIdentityCard busy={true} error="index unreachable" onDelete={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('index unreachable');
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  });
});
