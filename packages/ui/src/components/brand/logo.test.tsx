import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BRAND_RED, IdentizenLogo, KimiMark, KimiSeal } from './logo';

describe('brand logo components', () => {
  it('renders the mark as an accessible image in currentColor', () => {
    const { container } = render(<KimiMark size={40} />);
    const svg = screen.getByRole('img', { name: 'Identizen' });
    expect(svg).toHaveAttribute('width', '40');
    expect(container.querySelectorAll('path[stroke="currentColor"]')).toHaveLength(4);
    expect(container.querySelector('rect')).toHaveAttribute('stroke', 'currentColor');
  });

  it('hides a decorative mark from assistive tech', () => {
    const { container } = render(<KimiMark title={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('paints the seal in red, ink or the accent', () => {
    const { container, rerender } = render(<KimiSeal />);
    expect(container.querySelector('rect')).toHaveAttribute('fill', BRAND_RED);
    rerender(<KimiSeal tone="ink" />);
    expect(container.querySelector('rect')).toHaveAttribute('fill', '#17171A');
    rerender(<KimiSeal tone="accent" />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toMatch(/--color-accent/);
  });

  it('renders the lockup with one red dot and keeps the aspect ratio', () => {
    const { container } = render(<IdentizenLogo height={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '24');
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(24 * 4);
    expect(container.querySelectorAll(`circle[fill="${BRAND_RED}"]`)).toHaveLength(1);
  });

  it('drops the red dot when asked and can render the wordmark alone', () => {
    const { container } = render(<IdentizenLogo variant="wordmark" redDot={false} />);
    expect(container.querySelector('circle')).toBeNull();
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });
});
