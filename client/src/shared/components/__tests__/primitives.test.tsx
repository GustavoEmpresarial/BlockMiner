import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity, Bell, Cpu, DollarSign, Wallet } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Card from '../Card';
import IconBadge from '../IconBadge';
import SectionHeader from '../SectionHeader';
import StatCard from '../StatCard';
import StatusPill from '../StatusPill';
import TabPills from '../TabPills';

describe('Shared UI Primitives — Transparency Standard', () => {
  afterEach(() => {
    cleanup();
  });
  describe('Card', () => {
    it('renders default card with neo-brutalist shadow and border classes without forced overflow or spacing', () => {
      render(<Card>Card Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(card.className).toContain('rounded-3xl');
      expect(card.className).toContain('border-2');
      expect(card.className).toContain('border-slate-800');
      expect(card.className).toContain('bg-slate-900/60');
      expect(card.className).toContain('shadow-[4px_4px_0px_#000000]');
      expect(card.className).toContain('p-5 sm:p-6');
      expect(card.className).not.toContain('overflow-hidden');
      expect(card.className).not.toContain('space-y-4');
    });

    it('applies optional spacing when requested (boolean or preset)', () => {
      const { rerender } = render(<Card spacing>Spaced Card</Card>);
      expect(screen.getByTestId('card').className).toContain('space-y-4');

      rerender(<Card spacing="sm">Compact Spacing</Card>);
      expect(screen.getByTestId('card').className).toContain('space-y-2');

      rerender(<Card spacing="lg">Large Spacing</Card>);
      expect(screen.getByTestId('card').className).toContain('space-y-6');

      rerender(<Card spacing={false}>No Spacing</Card>);
      expect(screen.getByTestId('card').className).not.toContain('space-y-');
    });

    it('renders table variant without outer padding and with overflow-hidden', () => {
      render(<Card variant="table"><table><tbody><tr><td>Row</td></tr></tbody></table></Card>);
      const card = screen.getByTestId('card');
      expect(card.className).toContain('overflow-hidden');
      expect(card.className).not.toContain('p-5 sm:p-6');
    });

    it('applies overflow-hidden when explicitly requested via prop', () => {
      const { rerender } = render(<Card overflowHidden>Card</Card>);
      expect(screen.getByTestId('card').className).toContain('overflow-hidden');

      rerender(<Card overflow="hidden">Card</Card>);
      expect(screen.getByTestId('card').className).toContain('overflow-hidden');

      rerender(<Card overflow="auto">Card</Card>);
      expect(screen.getByTestId('card').className).toContain('overflow-auto');
    });

    it('renders glow styling when glow=true', () => {
      render(<Card glow>Glow Card</Card>);
      const card = screen.getByTestId('card');
      expect(card.className).toContain('border-primary/40');
      expect(card.className).toContain('shadow-[0_0_20px_rgba(59,130,246,0.15),4px_4px_0px_#000000]');
    });

    it('renders flat and compact variants properly', () => {
      const { rerender } = render(<Card variant="flat">Flat Card</Card>);
      expect(screen.getByTestId('card').className).toContain('!shadow-none');

      rerender(<Card variant="compact">Compact Card</Card>);
      expect(screen.getByTestId('card').className).toContain('p-3.5 sm:p-4');
    });
  });

  describe('IconBadge', () => {
    it('renders primary variant badge by default with 2px solid shadow', () => {
      render(<IconBadge icon={Cpu} />);
      const badge = screen.getByTestId('icon-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain('w-8 h-8 rounded-xl');
      expect(badge.className).toContain('bg-primary/10');
      expect(badge.className).toContain('border-primary/25');
      expect(badge.className).toContain('text-primary');
      expect(badge.className).toContain('shadow-[2px_2px_0px_#000000]');
    });

    it('renders thematic color variants correctly', () => {
      const { rerender } = render(<IconBadge icon={DollarSign} variant="emerald" />);
      expect(screen.getByTestId('icon-badge').className).toContain('text-emerald-400');

      rerender(<IconBadge icon={Bell} variant="amber" />);
      expect(screen.getByTestId('icon-badge').className).toContain('text-amber-400');

      rerender(<IconBadge icon={Wallet} variant="violet" />);
      expect(screen.getByTestId('icon-badge').className).toContain('text-violet-400');

      rerender(<IconBadge icon={Activity} variant="cyan" />);
      expect(screen.getByTestId('icon-badge').className).toContain('text-cyan-400');

      rerender(<IconBadge icon={Activity} variant="orange" />);
      expect(screen.getByTestId('icon-badge').className).toContain('text-orange-400');
    });
  });

  describe('SectionHeader', () => {
    it('renders section header with icon badge, title, subtitle and action', () => {
      render(
        <SectionHeader
          icon={Activity}
          iconVariant="primary"
          title="MINING OPERATIONS"
          subtitle="Real-time telemetry"
          action={<button type="button">Refresh</button>}
        />,
      );
      const header = screen.getByTestId('section-header');
      expect(header).toBeInTheDocument();
      expect(screen.getByText('MINING OPERATIONS')).toBeInTheDocument();
      expect(screen.getByText('Real-time telemetry')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });
  });

  describe('StatCard', () => {
    it('renders KPI metric card with label, value, sub, and icon', () => {
      render(
        <StatCard
          icon={Wallet}
          label="Total Balance"
          value="154.20 POL"
          sub="+12% today"
          accent="text-emerald-400"
        />,
      );
      const card = screen.getByTestId('stat-card');
      expect(card).toBeInTheDocument();
      expect(screen.getByText('Total Balance')).toBeInTheDocument();
      expect(screen.getByText('154.20 POL')).toBeInTheDocument();
      expect(screen.getByText('+12% today')).toBeInTheDocument();
    });

    it('renders custom ReactNode icon such as an image badge', () => {
      render(
        <StatCard
          icon={<img src="/test.png" alt="custom" data-testid="custom-icon" />}
          label="Custom Icon Stat"
          value="100 SHIB"
        />,
      );
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
      expect(screen.getByText('Custom Icon Stat')).toBeInTheDocument();
      expect(screen.getByText('100 SHIB')).toBeInTheDocument();
    });
  });

  describe('StatusPill', () => {
    it('renders status pill with variant styling', () => {
      const { rerender } = render(<StatusPill variant="success" label="Active" />);
      const pill = screen.getByTestId('status-pill');
      expect(pill).toBeInTheDocument();
      expect(pill.className).toContain('text-emerald-400');

      rerender(<StatusPill variant="warning" label="Pending" />);
      expect(screen.getByTestId('status-pill').className).toContain('text-amber-400');

      rerender(<StatusPill variant="danger" label="Failed" />);
      expect(screen.getByTestId('status-pill').className).toContain('text-red-400');

      rerender(<StatusPill variant="primary" label="Primary" />);
      expect(screen.getByTestId('status-pill').className).toContain('text-primary');

      rerender(<StatusPill variant="cyan" label="Cyan" />);
      expect(screen.getByTestId('status-pill').className).toContain('text-cyan-400');

      rerender(<StatusPill variant="orange" label="Orange" />);
      expect(screen.getByTestId('status-pill').className).toContain('text-orange-400');
    });
  });

  describe('TabPills', () => {
    it('renders tab list, respects panelId on aria-controls and switches tabs on click', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const tabs = [
        { key: 'tab1', label: 'Tab One', icon: Activity, panelId: 'custom-panel-1' },
        { key: 'tab2', label: 'Tab Two', icon: Cpu },
      ];

      render(<TabPills tabs={tabs} activeTab="tab1" onChange={onChange} ariaLabel="Test Tabs" />);

      const tabList = screen.getByRole('tablist', { name: 'Test Tabs' });
      expect(tabList).toBeInTheDocument();

      const tab1 = screen.getByRole('tab', { name: /Tab One/i });
      const tab2 = screen.getByRole('tab', { name: /Tab Two/i });

      expect(tab1).toHaveAttribute('aria-selected', 'true');
      expect(tab1).toHaveAttribute('aria-controls', 'custom-panel-1');
      expect(tab2).toHaveAttribute('aria-selected', 'false');
      expect(tab2).toHaveAttribute('aria-controls', 'panel-tab2');

      await user.click(tab2);
      expect(onChange).toHaveBeenCalledWith('tab2');
    });

    it('navigates tabs using keyboard arrow keys with WAI-ARIA APG pattern', () => {
      const onChange = vi.fn();
      const tabs = [
        { key: 'tab1', label: 'Tab One' },
        { key: 'tab2', label: 'Tab Two' },
        { key: 'tab3', label: 'Tab Three' },
      ];

      render(<TabPills tabs={tabs} activeTab="tab1" onChange={onChange} ariaLabel="Test Tabs" />);

      const tab1 = screen.getByRole('tab', { name: /Tab One/i });
      fireEvent.keyDown(tab1, { key: 'ArrowRight' });

      expect(onChange).toHaveBeenCalledWith('tab2');
    });
  });
});
