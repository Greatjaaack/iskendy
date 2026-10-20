import * as Dialog from '@radix-ui/react-dialog';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Emotion } from '../../content/emotion';
import { ratingContent as text } from '../../content/rating';
import { reviewContent as review } from '../../content/review';
import { EmotionCharacter } from '../EmotionCharacter/EmotionCharacter';
import { EmotionSlider } from '../EmotionSlider/EmotionSlider';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import { Sheet } from '../Sheet/Sheet';
import { Icon } from '../Icon/Icon';
import { Attachments, type AttachmentDraft } from '../Attachments/Attachments';
import styles from './RatingDialog.module.css';
import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';

export type RatingStep = 1 | 2 | 3 | 4;
export type RatingDraft = {
  emotion: Emotion | null;
  tags: string[];
  comment: string;
  other?: string;
};
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  number: number;
  step: RatingStep;
  canGoBack?: boolean;
  draft: RatingDraft;
  branch: 'positive' | 'negative';
  onDraftChange: (draft: RatingDraft) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onSkipRating?: () => void;
  pending?: boolean;
  error?: string;
  mapsHref?: string;
  onReviewClick?: () => void;
  alreadyMessage?: string;
  onRestoreFocus?: () => void;
  /** Uploads step-3 files before the detail; false keeps them in the draft. */
  onFiles?: (files: File[]) => Promise<boolean>;
};
/** Real input and feedback API; files go through onFiles before the detail. */
export function RatingDialog({
  open,
  onOpenChange,
  trigger,
  number,
  step,
  canGoBack = step > 1,
  draft,
  branch,
  onDraftChange,
  onBack,
  onNext,
  onSkip,
  onSkipRating,
  pending = false,
  error,
  alreadyMessage,
  onRestoreFocus,
  onFiles,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null),
    content = useRef<HTMLDivElement>(null),
    previousStep = useRef(step);
  const [files, setFiles] = useState<AttachmentDraft[]>([]),
    [fileError, setFileError] = useState(''),
    [uploading, setUploading] = useState(false),
    busy = pending || uploading;
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const otherTrigger = useRef<HTMLButtonElement>(null);
  const editOther = () => {
    setOtherText(draft.other ?? '');
    setOtherOpen(true);
  };
  const motionEnabled = useMotionEnabled(open);
  const body = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    if (!open || !body.current) return;
    const node = body.current;
    const measure = () =>
      setScrollable(node.scrollHeight > node.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => observer.disconnect();
  }, [open, step, draft.tags.length]);
  const emotion = draft.emotion ?? 3;
  const placeContent = useCallback((el: HTMLDivElement | null) => {
    content.current = el;
    if (!el) return;
    const height = window.visualViewport?.height ?? window.innerHeight,
      wide =
        window.matchMedia('(min-width:768px)').matches; /* figma: 794:396 */
    el.style.top =
      (window.visualViewport?.offsetTop ?? 0) +
      (wide ? Math.max(16, (height - Math.min(820, height - 32)) / 2) : 0) +
      'px';
    el.style.height = (wide ? Math.min(820, height - 32) : height) + 'px';
    el.style.maxHeight = height + 'px';
  }, []);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const place = () => placeContent(content.current);
    place();
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [open, placeContent]);
  useEffect(() => {
    if (previousStep.current !== step && open)
      heading.current?.focus({ preventScroll: true });
    previousStep.current = step;
  }, [step, open]);
  const reasons = text.reasons[branch];
  const next = async () => {
    if (step === 3 && files.length) {
      setFileError('');
      setUploading(true);
      const sent = onFiles
        ? await onFiles(files.map(({ file }) => file))
        : false;
      setUploading(false);
      if (!sent) {
        setFileError(review.unavailableFiles);
        return;
      }
      setFiles([]);
    }
    setFileError('');
    onNext();
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOtherOpen(false);
        onOpenChange(nextOpen);
      }}
    >
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          ref={placeContent}
          className={styles.content}
          data-emotion={emotion}
          data-step={step}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            heading.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={
            onRestoreFocus
              ? (event) => {
                  event.preventDefault();
                  onRestoreFocus();
                }
              : undefined
          }
        >
          {motionEnabled && (
            <MotionEnhancement
              kind="surface"
              target={content}
              value={
                step === 1
                  ? `--color-rating-surface-${emotion}`
                  : '--review-paper'
              }
            />
          )}
          <header className={styles.header}>
            {canGoBack ? (
              <button
                type="button"
                className={styles.round}
                aria-label={text.back}
                disabled={pending}
                onClick={onBack}
              >
                <Icon name="arrow-left" />
              </button>
            ) : (
              <span className={styles.spacer} />
            )}
            <Dialog.Title className={styles.label}>
              {step === 4 ? text.thanks : text.title(number)}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className={styles.round}
                aria-label={text.close}
              >
                <Icon name="close" />
              </button>
            </Dialog.Close>
          </header>
          <div ref={body} className={styles.body}>
            {step === 1 && (
              <>
                <h2 ref={heading} tabIndex={-1} className={styles.question}>
                  {text.question}
                </h2>
                <div className={styles.portrait}>
                  <EmotionCharacter emotion={emotion} />
                </div>
                <h3 className={styles.emotionName}>
                  {text.names[emotion - 1]}
                </h3>
                <p className={styles.caption}>{text.captions[emotion - 1]}</p>
                <div className={styles.slider}>
                  <EmotionSlider
                    value={emotion}
                    label={text.question}
                    valueText={text.names[emotion - 1]}
                    disabled={pending}
                    onValueChange={(value) =>
                      onDraftChange({ ...draft, emotion: value })
                    }
                  />
                  <div className={styles.endpoints}>
                    <span>{text.endpoints[0]}</span>
                    <span>{text.endpoints[1]}</span>
                  </div>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div className={styles.reasonPortrait}>
                  <EmotionCharacter emotion={emotion} />
                </div>
                <h2 ref={heading} tabIndex={-1} className={styles.reasonTitle}>
                  {branch === 'negative' && emotion > 1
                    ? text.reasons.negative.mildTitle
                    : reasons.title}
                </h2>
                <p className={styles.reasonsHint}>{text.reasonsHint}</p>
                <div className={styles.tags}>
                  {reasons.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      ref={tag === 'Другое' ? otherTrigger : undefined}
                      className={styles.tag}
                      aria-pressed={draft.tags.includes(tag)}
                      disabled={pending}
                      onClick={() => {
                        if (tag === 'Другое' && !draft.tags.includes(tag)) {
                          editOther();
                          return;
                        }
                        onDraftChange({
                          ...draft,
                          tags: draft.tags.includes(tag)
                            ? draft.tags.filter((item) => item !== tag)
                            : [...draft.tags, tag],
                        });
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {draft.tags.includes('Другое') && (
                  <button
                    type="button"
                    className={styles.otherSummary + ' ym-hide-content'}
                    onClick={editOther}
                  >
                    <strong>{review.otherLabel}</strong>
                    <span>{draft.other || review.otherHint}</span>
                  </button>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h2 ref={heading} tabIndex={-1} className={styles.commentTitle}>
                  {text.commentTitle}
                </h2>
                <p>{text.commentHint}</p>
                <Input
                  kind="comment"
                  label={review.commentLabel}
                  placeholder={review.commentHint}
                  value={draft.comment}
                  maxLength={1000}
                  hint={`${draft.comment.length} / 1000`}
                  disabled={busy}
                  onValueChange={(comment) =>
                    onDraftChange({ ...draft, comment })
                  }
                />
                <Attachments
                  files={files}
                  onChange={(nextFiles) => {
                    setFiles(nextFiles);
                    setFileError('');
                  }}
                  disabled={busy}
                />
                <p className={styles.anonymous}>{review.anonymousReview}</p>
              </>
            )}
            {step === 4 && (
              <>
                <div className={styles.thanksCharacter}>
                  <EmotionCharacter emotion={emotion === 1 ? 2 : emotion} />
                </div>
                <h2 ref={heading} tabIndex={-1} className={styles.thanksTitle}>
                  {alreadyMessage
                    ? text.thanks
                    : branch === 'positive'
                      ? text.thanksPositive
                      : text.thanksNegative}
                </h2>
                <p>
                  {alreadyMessage ??
                    (branch === 'positive'
                      ? 'Рады, что вам вкусно.'
                      : text.thanksNegativeHint)}
                </p>
              </>
            )}
            {(error || fileError) && (
              <p className={styles.error} role="alert">
                {fileError || error}
              </p>
            )}
          </div>
          <footer className={styles.actions} data-scrollable={scrollable}>
            <Button
              label={
                step === 4 ? text.done : step === 3 ? text.send : text.next
              }
              state={busy ? 'loading' : 'default'}
              onClick={
                step === 4 ? () => onOpenChange(false) : () => void next()
              }
            />
            {step < 4 && (
              <Button
                variant="secondary"
                label={text.skip}
                disabled={busy}
                onClick={
                  step === 1
                    ? (onSkipRating ?? (() => onOpenChange(false)))
                    : step === 2
                      ? onSkip
                      : () => void next()
                }
              />
            )}
          </footer>
          <Sheet
            open={open && step === 2 && otherOpen}
            onOpenChange={setOtherOpen}
            title={review.otherLabel}
            focusField
            closeButton
            layer="nested"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              otherTrigger.current?.focus({ preventScroll: true });
            }}
          >
            <Input
              kind="comment"
              label={review.otherLabel}
              placeholder={review.otherHint}
              showHint={false}
              value={otherText}
              maxLength={1000}
              onValueChange={setOtherText}
            />
            <Button
              label={review.otherDone}
              onClick={() => {
                onDraftChange({
                  ...draft,
                  tags: draft.tags.includes('Другое')
                    ? draft.tags
                    : [...draft.tags, 'Другое'],
                  other: otherText.trim(),
                });
                setOtherOpen(false);
              }}
            />
          </Sheet>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
