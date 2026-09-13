import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MachineQuantityModal } from './machines.quantityModal';

afterEach(cleanup);

describe('MachineQuantityModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MachineQuantityModal open={false} onClose={vi.fn()} title="T" max={5} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog with title/subtitle and defaults quantity to max', () => {
    render(
      <MachineQuantityModal
        open
        onClose={vi.fn()}
        title="Move to warehouse"
        subtitle="Pick how many"
        quantityLabel="Quantity"
        max={5}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Move to warehouse')).toBeInTheDocument();
    expect(screen.getByText('Pick how many')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveValue(5);
  });

  it('clicking the backdrop calls onClose, but clicking inside the dialog does not', () => {
    const onClose = vi.fn();
    render(
      <MachineQuantityModal open onClose={onClose} title="T" max={5} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />,
    );
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click does nothing while busy', () => {
    const onClose = vi.fn();
    render(
      <MachineQuantityModal open onClose={onClose} busy title="T" max={5} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />,
    );
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clamps typed input between min and max', () => {
    render(
      <MachineQuantityModal open onClose={vi.fn()} title="T" max={5} min={2} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />,
    );
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '999' } });
    expect(input).toHaveValue(5);
    fireEvent.change(input, { target: { value: '0' } });
    expect(input).toHaveValue(2);
  });

  it('resets to min when the typed value is not a finite number', () => {
    render(<MachineQuantityModal open onClose={vi.fn()} title="T" max={5} min={2} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input).toHaveValue(2);
  });

  it('calls onConfirm with the clamped quantity', () => {
    const onConfirm = vi.fn();
    render(<MachineQuantityModal open onClose={vi.fn()} title="T" max={5} confirmLabel="Confirm" cancelLabel="Cancel" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledWith(5);
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<MachineQuantityModal open onClose={onClose} title="T" max={5} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the input and both buttons while busy', () => {
    render(<MachineQuantityModal open onClose={vi.fn()} busy title="T" max={5} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByText('OK')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  it('treats a non-numeric/absent max as falling back to min', () => {
    render(<MachineQuantityModal open onClose={vi.fn()} title="T" max={'not-a-number' as unknown as number} min={3} confirmLabel="OK" cancelLabel="Cancel" onConfirm={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toHaveValue(3);
  });
});
