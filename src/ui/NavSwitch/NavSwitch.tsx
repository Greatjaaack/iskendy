import { Link } from '../../app/router';
import { navigationContent } from '../../content/navigation';
import styles from './NavSwitch.module.css';
import { orderListHref } from '../../domain/order/routes';
import { ordersContent } from '../../content/orders';
export type Section = 'order' | 'board' | 'help';
type Props = (
  { active: 'none'; number: string } | { active: Section; number?: string }
) & {
  className?: string;
  collection?: boolean;
  /** Q-14: no «Табло» tab before the guest has an order. */
  board?: boolean;
};
export function NavSwitch({
  active,
  number,
  className,
  collection = false,
  board = true,
}: Props) {
  const hasOrder = number !== undefined;
  return (
    <nav
      aria-label={navigationContent.label}
      className={[
        styles.nav,
        collection ? styles.collection : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(board
        ? (['order', 'board', 'help'] as const)
        : (['order', 'help'] as const)
      ).map((section) => {
        const selected = section === active;
        const href =
          section === 'order'
            ? collection
              ? orderListHref
              : hasOrder
                ? '/board?my=1'
                : '/'
            : section === 'board'
              ? '/board?view=queue'
              : '/board?view=help';
        return (
          <Link
            key={section}
            to={href}
            aria-current={selected ? 'page' : undefined}
            aria-label={
              section === 'order' && hasOrder && !collection
                ? navigationContent.order + ' ' + number
                : undefined
            }
            className={styles.segment}
          >
            {collection && section === 'order' && (
              <span className={styles.receipt} aria-hidden="true" />
            )}
            {section !== 'order' && (
              <span
                aria-hidden="true"
                className={[
                  styles.icon,
                  styles[selected ? section + '-solid' : section],
                ].join(' ')}
              />
            )}
            <span>
              {section === 'order'
                ? collection
                  ? ordersContent.title
                  : hasOrder
                    ? navigationContent.order
                    : navigationContent.noOrder
                : navigationContent[section]}
            </span>
            {section === 'order' && hasOrder && !collection && (
              <span className={styles.badge}>{number}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
