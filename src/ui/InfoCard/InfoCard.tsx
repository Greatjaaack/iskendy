import { footerContent } from '../../content/footer';
import { safeMapsHref } from '../Header/Header';
import pin from '../../assets/footer/pin.svg?no-inline';
import clock from '../../assets/footer/clock.svg?no-inline';
import telegram from '../../assets/footer/telegram.svg?no-inline';
import go from '../../assets/footer/go.svg?no-inline';
import styles from './InfoCard.module.css';
export const infoCardKinds = ['address', 'hours', 'telegram'] as const;
export type InfoCardKind = (typeof infoCardKinds)[number];
const icons = { address: pin, hours: clock, telegram };
export function InfoCard({
  kind,
  href,
}: {
  kind: InfoCardKind;
  href?: string;
}) {
  const link = kind === 'hours' ? undefined : safeMapsHref(href);
  const content = footerContent[kind];
  const children = (
    <>
      <span className={styles.chip}>
        <img src={icons[kind]} width="24" height="24" alt="" />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{content.title}</span>
        <span className={styles.value}>
          {(Array.isArray(content.value) ? content.value : [content.value]).map(
            (line) => (
              <span key={line} className={styles.line}>
                {line}
              </span>
            ),
          )}
        </span>
      </span>
      {link && (
        <img className={styles.go} src={go} width="22" height="22" alt="" />
      )}
    </>
  );
  return link ? (
    <a
      className={styles.card}
      data-kind={kind}
      href={link}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ) : (
    <div className={styles.card} data-kind={kind}>
      {children}
    </div>
  );
}
