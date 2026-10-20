import { SidePanel } from './SidePanel';
import { ComputerWidget } from './widgets/computer';

/** The system: this computer live (processor, memory, graphics card, disks, network) and the status of Phibe's models. */
export function ComputerPanel({ open }: { open: boolean }) {
  return (
    <SidePanel open={open} label="System">
      {open && <ComputerWidget />}
    </SidePanel>
  );
}
