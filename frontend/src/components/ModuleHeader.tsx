import { Icon, type IconName } from './Icon';

/** The header every module screen starts with: an icon tile and the module's name. */
export function ModuleHeader({ icon, title }: { icon: IconName; title: string }) {
  return (
    <header className="fin-header">
      <div className="fin-hello">
        <span className="module-mark"><Icon name={icon} size={26} /></span>
        <h2>{title}</h2>
      </div>
    </header>
  );
}
