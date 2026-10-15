import { footerContent } from '../../content/footer';
import { reviewContent } from '../../content/review';
import { venueContent as text } from '../../content/venue';
import location from '../../assets/review/location.svg';
import hours from '../../assets/review/hours.svg';
import telegram from '../../assets/review/telegram.svg';
import { Icon } from '../Icon/Icon';
import styles from './VenueCards.module.css';

/** Original vector illustrations reuse the current outline and pastel palette. */
export function VenueCards() {
  const cards = [
    {
      kind: 'address',
      title: text.address,
      lines: [footerContent.address.title],
      action: text.maps,
      href: text.mapsHref,
      art: location,
    },
    {
      kind: 'hours',
      title: footerContent.hours.title,
      lines: footerContent.hours.value,
      art: hours,
    },
    {
      kind: 'telegram',
      title: footerContent.telegram.title,
      lines: [footerContent.telegram.value],
      href: text.telegramHref,
      art: telegram,
    },
  ];
  return (
    <section className={styles.section} aria-labelledby="venue-heading">
      <h2 id="venue-heading">{text.title}</h2>
      <div className={styles.grid}>
        {cards.map((card) => {
          const content = (
            <>
              <span className={styles.art}>
                <img src={card.art} width="149" height="82" alt="" />
              </span>
              <span className={styles.copy}>
                <strong>{card.title}</strong>
                <span className={styles.lines}>
                  {card.lines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
                {card.action && (
                  <span className={styles.action}>{card.action}</span>
                )}
              </span>
              {card.href && (
                <span className={styles.arrow} aria-hidden="true">
                  <Icon name="arrow-right" />
                </span>
              )}
            </>
          );
          return card.href ? (
            <a
              key={card.kind}
              className={styles.card}
              data-kind={card.kind}
              data-venue-card
              data-hover-card
              data-cursor-label={reviewContent.cursorGo}
              data-cursor-tone={
                card.kind === 'telegram' ? 'contrast' : undefined
              }
              href={card.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {content}
            </a>
          ) : (
            <article
              key={card.kind}
              className={styles.card}
              data-kind={card.kind}
              data-venue-card
            >
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}
