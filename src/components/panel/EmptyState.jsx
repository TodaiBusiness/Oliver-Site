import Icon from '../Icon.jsx';
import PanelIcon, { hasPanelIcon } from './PanelIcon.jsx';

/**
 * Estado vazio honesto: quando não há dado, dizemos que não há — em vez de
 * inventar número ou gráfico de exemplo. Sempre que possível traz uma ação.
 */
export default function EmptyState({ icon = 'layers', title, text, action }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        {hasPanelIcon(icon) ? <PanelIcon name={icon} size={22} /> : <Icon name={icon} size={22} />}
      </span>
      <h3 className="empty__title">{title}</h3>
      {text ? <p className="empty__text">{text}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}
